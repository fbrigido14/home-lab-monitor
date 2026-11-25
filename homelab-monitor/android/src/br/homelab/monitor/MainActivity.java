package br.homelab.monitor;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.app.KeyguardManager;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.SslErrorHandler;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.security.cert.X509Certificate;

/**
 * Tela principal: a dashboard completa (mesma interface do navegador) com integrações nativas:
 * bloqueio por biometria/PIN, certificados fixados, envio e download de arquivos, links externos
 * no navegador, tela de sem conexão e atalho para os ajustes do app.
 */
public class MainActivity extends Activity {
    private static final int REQ_UNLOCK = 1, REQ_FILE = 2, REQ_PERM = 3;
    private WebView web;
    private ProgressBar bar;
    private String server, origin;
    private volatile String pageOrigin = "";
    private ValueCallback<Uri[]> fileCb;
    private long stoppedAt = 0;
    private boolean unlocking = false, unlocked = false, offline = false, internal = false;

    @Override
    protected void onCreate(Bundle b) {
        Ui.applyTheme(this);
        super.onCreate(b);
        Ui.bars(this);
        server = Prefs.server(this);
        if (server == null) {
            startActivity(new Intent(this, SetupActivity.class));
            finish();
            return;
        }
        origin = Net.origin(server);
        Notify.channels(this);
        AlertJob.schedule(this);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Ui.bg(this));
        root.setFitsSystemWindows(true);
        web = new WebView(this);
        web.setBackgroundColor(Ui.bg(this));
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        bar.setProgressTintList(android.content.res.ColorStateList.valueOf(Ui.accent(this)));
        root.addView(bar, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Ui.dp(this, 3)));
        setContentView(root);
        setupWeb();

        if (b != null) web.restoreState(b);
        else web.loadUrl(urlFor(getIntent()));
        askNotificationPermission();
    }

    private String urlFor(Intent i) {
        String page = i == null ? null : i.getStringExtra("page");
        return server + "/" + (page != null && page.matches("[a-z]+") ? "#" + page : "");
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        if (web == null) return;
        if (i.getBooleanExtra("reload", false)) web.loadUrl(server + "/");
        else if (i.getStringExtra("page") != null) web.loadUrl(urlFor(i));
    }

    private void setupWeb() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportMultipleWindows(false);          // target=_blank passa por shouldOverrideUrlLoading
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setTextZoom(100);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setUserAgentString(s.getUserAgentString() + " HomelabMonitorApp/" + BuildInfo.VERSION);
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, false);
        web.addJavascriptInterface(new Bridge(), "HMApp");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                String scheme = u.getScheme() == null ? "" : u.getScheme();
                if ("hmapp".equals(scheme)) {
                    if ("setup".equals(u.getHost())) openSetup(); else retry();
                    return true;
                }
                if (Net.origin(u.toString()).equals(origin)) return false;   // a própria dashboard
                openExternal(u);                                              // atalhos, sites externos, mailto…
                return true;
            }

            @Override
            public void onPageStarted(WebView v, String url, Bitmap fav) {
                pageOrigin = Net.origin(url);
                bar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                bar.setVisibility(View.GONE);
                saveCookie();
            }

            @Override
            public void doUpdateVisitedHistory(WebView v, String url, boolean reload) { pageOrigin = Net.origin(url); }

            @Override
            public void onReceivedSslError(WebView v, final SslErrorHandler h, SslError err) {
                X509Certificate cert = Net.fromSsl(err.getCertificate());
                final String fp = cert == null ? "" : Net.fingerprint(cert);
                boolean same = Net.origin(err.getUrl()).equals(origin);
                if (same && !fp.isEmpty() && Prefs.trusted(MainActivity.this).contains(fp)) { h.proceed(); return; }
                h.cancel();
                if (!same || fp.isEmpty()) return;
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("Certificado do servidor mudou")
                        .setMessage("O certificado do servidor não é o que você confirmou antes. Se você trocou o certificado, confira a "
                                + "impressão digital e confie de novo. Se não trocou, alguém pode estar interceptando a conexão.\n\nSHA-256:\n" + fp)
                        .setPositiveButton("Confiar neste", new DialogInterface.OnClickListener() {
                            public void onClick(DialogInterface d, int w) { Prefs.trust(MainActivity.this, fp); retry(); }
                        })
                        .setNegativeButton("Cancelar", null).show();
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) showOffline(String.valueOf(err.getDescription()));
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView v, int p) { bar.setProgress(p); }

            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                try {
                    internal = true;   // voltar do seletor de arquivos não deve pedir desbloqueio
                    startActivityForResult(params.createIntent(), REQ_FILE);
                } catch (ActivityNotFoundException e) {
                    fileCb = null;
                    toast("Nenhum app para escolher arquivos");
                    return false;
                }
                return true;
            }
        });

        web.setDownloadListener(new DownloadListener() {
            public void onDownloadStart(String url, String ua, String cd, String mime, long len) {
                if (!url.startsWith("http")) return;   // blobs usam HMApp.saveFile
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                String c = CookieManager.getInstance().getCookie(url);
                if (c != null) r.addRequestHeader("Cookie", c);
                r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, URLUtil.guessFileName(url, cd, mime));
                getSystemService(DownloadManager.class).enqueue(r);
                toast("Baixando…");
            }
        });
    }

    /** Ponte JavaScript: só atende a própria dashboard. */
    private final class Bridge {
        private boolean ok() { return origin.equals(pageOrigin); }

        @JavascriptInterface
        public void openSettings() {
            if (!ok()) return;
            runOnUiThread(new Runnable() { public void run() { internal = true; startActivity(new Intent(MainActivity.this, SettingsActivity.class)); } });
        }

        @JavascriptInterface
        public void saveFile(final String name, final String mime, final String b64) {
            if (!ok()) return;
            runOnUiThread(new Runnable() { public void run() { save(name, mime, b64); } });
        }

        @JavascriptInterface
        public void share(final String title, final String text) {
            if (!ok()) return;
            runOnUiThread(new Runnable() {
                public void run() {
                    Intent i = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
                    startActivity(Intent.createChooser(i, title));
                }
            });
        }

        @JavascriptInterface
        public String info() {
            if (!ok()) return "{}";
            try {
                return new JSONObject().put("version", BuildInfo.VERSION).put("notify", Prefs.notifyLevel(MainActivity.this)).toString();
            } catch (Exception e) {
                return "{}";
            }
        }
    }

    private void save(String name, String mime, String b64) {
        String safe = name.replaceAll("[^A-Za-z0-9._ -]", "_");
        try {
            byte[] data = Base64.decode(b64, Base64.DEFAULT);
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, safe);
                v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Homelab Monitor");
                Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                OutputStream out = getContentResolver().openOutputStream(uri);
                out.write(data);
                out.close();
            } else {
                if (checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_PERM);
                    toast("Permita o acesso ao armazenamento e tente de novo");
                    return;
                }
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Homelab Monitor");
                dir.mkdirs();
                FileOutputStream out = new FileOutputStream(new File(dir, safe));
                out.write(data);
                out.close();
            }
            toast("Salvo em Downloads/Homelab Monitor/" + safe);
        } catch (Exception e) {
            toast("Não foi possível salvar: " + e.getMessage());
        }
    }

    private void openExternal(Uri u) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, u).addCategory(Intent.CATEGORY_BROWSABLE));
        } catch (ActivityNotFoundException e) {
            toast("Nenhum app abre este endereço");
        }
    }

    private void showOffline(String why) {
        offline = true;
        boolean dark = Ui.night(this);
        String html = "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><style>"
                + "body{margin:0;font-family:sans-serif;background:" + (dark ? "#0f1412;color:#e4ebe7" : "#e6ebe8;color:#17201c") + ";display:grid;place-items:center;min-height:100vh}"
                + ".c{max-width:340px;padding:24px;text-align:center}h1{font-size:20px}p{opacity:.75;font-size:14px;line-height:1.5}"
                + "a{display:block;margin:10px 0;padding:12px;border-radius:8px;text-decoration:none;font-weight:600}"
                + ".p{background:" + (dark ? "#4fc2b9;color:#0f1412" : "#116a67;color:#fff") + "}.s{border:1px solid " + (dark ? "#2b3530;color:#e4ebe7" : "#d3dbd6;color:#17201c") + "}"
                + "</style></head><body><div class='c'><h1>Sem conexão com a dashboard</h1><p>"
                + android.text.TextUtils.htmlEncode(server) + "<br><small>" + android.text.TextUtils.htmlEncode(why) + "</small></p>"
                + "<p>Confira se você está na rede de casa ou na VPN.</p><a class='p' href='hmapp://retry'>Tentar de novo</a>"
                + "<a class='s' href='hmapp://setup'>Trocar servidor</a></div></body></html>";
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    private void retry() {
        offline = false;
        web.loadUrl(server + "/");
    }

    private void openSetup() { startActivity(new Intent(this, SetupActivity.class)); }

    private void saveCookie() {
        String c = CookieManager.getInstance().getCookie(server);
        if (c != null) Prefs.setCookie(this, c);
        CookieManager.getInstance().flush();
    }

    private void askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && !"off".equals(Prefs.notifyLevel(this))
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                && !Prefs.p(this).getBoolean("asked_notif", false)) {
            Prefs.p(this).edit().putBoolean("asked_notif", true).apply();
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_PERM);
        }
    }

    /* ---------- bloqueio por biometria / PIN do aparelho ---------- */
    private void maybeLock() {
        if (!Prefs.lock(this) || unlocking) return;
        boolean expired = !unlocked || (stoppedAt > 0 && SystemClock.elapsedRealtime() - stoppedAt > Prefs.lockTimeoutSec(this) * 1000L);
        if (!expired) return;
        KeyguardManager km = getSystemService(KeyguardManager.class);
        if (!km.isDeviceSecure()) {
            toast("Configure um bloqueio de tela no Android para usar o bloqueio do app");
            unlocked = true;
            return;
        }
        Intent i = km.createConfirmDeviceCredentialIntent("Homelab Monitor", "Confirme que é você para abrir a dashboard");
        if (i == null) { unlocked = true; return; }
        unlocking = true;
        web.setVisibility(View.INVISIBLE);
        startActivityForResult(i, REQ_UNLOCK);
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_UNLOCK) {
            unlocking = false;
            if (res == RESULT_OK) { unlocked = true; stoppedAt = 0; web.setVisibility(View.VISIBLE); }
            else finish();
        } else if (req == REQ_FILE && fileCb != null) {
            fileCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
            fileCb = null;
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web == null) return;
        web.onResume();
        String now = Prefs.server(this);
        if (now != null && !now.equals(server)) { recreate(); return; }   // trocou de servidor nos ajustes
        if (internal) { internal = false; stoppedAt = 0; }
        maybeLock();
        if (!Prefs.lock(this)) web.setVisibility(View.VISIBLE);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web == null) return;
        web.onPause();
        saveCookie();
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (!unlocking && !internal) stoppedAt = SystemClock.elapsedRealtime();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null && !offline) web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            ((ViewGroup) web.getParent()).removeView(web);
            web.destroy();
        }
        super.onDestroy();
    }

    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_LONG).show(); }
}
