package br.homelab.monitor;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.webkit.CookieManager;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CompoundButton;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

/** Ajustes do app: servidor, notificações e segurança. */
public class SettingsActivity extends Activity {
    @Override
    protected void onCreate(Bundle b) {
        Ui.applyTheme(this);
        super.onCreate(b);
        Ui.bars(this);
        ScrollView sv = new ScrollView(this);
        sv.setBackgroundColor(Ui.bg(this));
        sv.setFitsSystemWindows(true);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int p = Ui.dp(this, 18);
        root.setPadding(p, p, p, p);
        sv.addView(root);
        setContentView(sv);

        TextView title = Ui.text(this, "Ajustes do app", 22, Ui.ink(this), true);
        title.setPadding(0, 0, 0, Ui.dp(this, 14));
        root.addView(title);

        // ---- Servidor
        LinearLayout srv = section(root, "Servidor");
        srv.addView(Ui.text(this, Prefs.server(this), 15, Ui.ink(this), false));
        String info = "";
        try {
            JSONObject s = new JSONObject(Prefs.summary(this));
            info = s.optString("app_name") + " · versão " + s.optString("version");
        } catch (Exception ignored) { }
        if (!info.isEmpty()) srv.addView(Ui.text(this, info, 13, Ui.muted(this), false));
        Button change = Ui.button(this, "Trocar servidor", false);
        change.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) { startActivity(new Intent(SettingsActivity.this, SetupActivity.class)); }
        });
        srv.addView(change);
        Button logout = Ui.button(this, "Sair da conta neste aparelho", false);
        logout.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) {
                CookieManager.getInstance().removeAllCookies(null);
                CookieManager.getInstance().flush();
                Prefs.setCookie(SettingsActivity.this, null);
                toast("Sessão apagada. Entre de novo na dashboard.");
                Intent i = new Intent(SettingsActivity.this, MainActivity.class);
                i.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP).putExtra("reload", true);
                startActivity(i);
                finish();
            }
        });
        srv.addView(logout);

        // ---- Notificações
        LinearLayout nt = section(root, "Notificações");
        nt.addView(label("Avisar no celular"));
        final String[] lv = {"warn", "crit", "off"};
        Spinner level = spinner(new String[]{"Alertas críticos e avisos", "Só alertas críticos", "Desligadas"}, indexOf(lv, Prefs.notifyLevel(this)));
        level.setOnItemSelectedListener(new Sel() {
            void picked(int i) { Prefs.p(SettingsActivity.this).edit().putString("notify", lv[i]).apply(); AlertJob.schedule(SettingsActivity.this); }
        });
        nt.addView(level);
        nt.addView(label("Verificar a cada"));
        final int[] mins = {15, 30, 60};
        int cur = Prefs.intervalMin(this);
        Spinner every = spinner(new String[]{"15 minutos", "30 minutos", "1 hora"}, cur == 60 ? 2 : cur == 30 ? 1 : 0);
        every.setOnItemSelectedListener(new Sel() {
            void picked(int i) { Prefs.p(SettingsActivity.this).edit().putInt("interval", mins[i]).apply(); AlertJob.schedule(SettingsActivity.this); }
        });
        nt.addView(every);
        TextView hint = Ui.text(this, "O Android permite no mínimo 15 minutos entre verificações em segundo plano. "
                + "Para avisos instantâneos, use também o Telegram (Configurações › Segurança e notificações na dashboard).", 12, Ui.muted(this), false);
        hint.setPadding(0, Ui.dp(this, 8), 0, 0);
        nt.addView(hint);
        Button test = Ui.button(this, "Enviar notificação de teste", false);
        test.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) {
                Notify.channels(SettingsActivity.this);
                if (!Notify.allowed(SettingsActivity.this)) { toast("As notificações do app estão bloqueadas no Android"); return; }
                Notify.alert(SettingsActivity.this, 4242, "crit", "Teste do Homelab Monitor", "As notificações estão funcionando.", "visao");
            }
        });
        nt.addView(test);
        Button check = Ui.button(this, "Verificar alertas agora", false);
        check.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) { AlertJob.runNow(SettingsActivity.this); toast("Verificando…"); }
        });
        nt.addView(check);
        if (Build.VERSION.SDK_INT >= 26) {
            Button sys = Ui.button(this, "Sons e importância por tipo de alerta", false);
            sys.setOnClickListener(new View.OnClickListener() {
                public void onClick(View v) {
                    startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()));
                }
            });
            nt.addView(sys);
        }

        // ---- Segurança
        LinearLayout sec = section(root, "Segurança");
        Switch lock = new Switch(this);
        lock.setText("Pedir biometria ou PIN para abrir");
        lock.setTextColor(Ui.ink(this));
        lock.setTextSize(15);
        lock.setChecked(Prefs.lock(this));
        lock.setOnCheckedChangeListener(new CompoundButton.OnCheckedChangeListener() {
            public void onCheckedChanged(CompoundButton bt, boolean on) { Prefs.p(SettingsActivity.this).edit().putBoolean("lock", on).apply(); }
        });
        sec.addView(lock);
        sec.addView(label("Bloquear de novo depois de"));
        final int[] secs = {0, 60, 300, 900};
        int ct = Prefs.lockTimeoutSec(this);
        Spinner to = spinner(new String[]{"Sempre que sair do app", "1 minuto", "5 minutos", "15 minutos"}, ct >= 900 ? 3 : ct >= 300 ? 2 : ct >= 60 ? 1 : 0);
        to.setOnItemSelectedListener(new Sel() {
            void picked(int i) { Prefs.p(SettingsActivity.this).edit().putInt("lock_timeout", secs[i]).apply(); }
        });
        sec.addView(to);
        int pins = Prefs.trusted(this).size();
        sec.addView(Ui.text(this, pins == 0 ? "Nenhum certificado autoassinado confiado." : pins + " certificado(s) autoassinado(s) confiado(s).", 13, Ui.muted(this), false));
        Button forget = Ui.button(this, "Esquecer certificados confiados", false);
        forget.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) {
                new AlertDialog.Builder(SettingsActivity.this).setMessage("O app vai pedir de novo a confirmação do certificado do servidor.")
                        .setPositiveButton("Esquecer", new DialogInterface.OnClickListener() {
                            public void onClick(DialogInterface d, int w) { Prefs.clearTrusted(SettingsActivity.this); toast("Certificados esquecidos"); }
                        }).setNegativeButton("Cancelar", null).show();
            }
        });
        sec.addView(forget);

        // ---- Sobre
        LinearLayout ab = section(root, "Sobre");
        ab.addView(Ui.text(this, "Homelab Monitor para Android " + BuildInfo.VERSION, 14, Ui.ink(this), false));
        ab.addView(Ui.text(this, "A interface é a mesma da dashboard e se atualiza junto com o servidor. "
                + "Adicione o widget \"Estado do homelab\" na tela inicial para ver o resumo sem abrir o app.", 12, Ui.muted(this), false));
        Button appInfo = Ui.button(this, "Informações do app no Android", false);
        appInfo.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) {
                startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
            }
        });
        ab.addView(appInfo);
    }

    private LinearLayout section(LinearLayout root, String title) {
        TextView t = Ui.text(this, title.toUpperCase(), 12, Ui.muted(this), true);
        t.setPadding(Ui.dp(this, 4), Ui.dp(this, 6), 0, Ui.dp(this, 6));
        root.addView(t);
        LinearLayout c = Ui.card(this);
        root.addView(c);
        return c;
    }

    private TextView label(String s) {
        TextView t = Ui.text(this, s, 13, Ui.muted(this), false);
        t.setPadding(0, Ui.dp(this, 10), 0, Ui.dp(this, 2));
        return t;
    }

    private Spinner spinner(String[] items, int sel) {
        Spinner sp = new Spinner(this);
        ArrayAdapter<String> ad = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, items);
        ad.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        sp.setAdapter(ad);
        sp.setSelection(sel, false);
        return sp;
    }

    private static int indexOf(String[] a, String v) {
        for (int i = 0; i < a.length; i++) if (a[i].equals(v)) return i;
        return 0;
    }

    /** Ignora o disparo inicial do Spinner e só reage à escolha da pessoa. */
    private abstract static class Sel implements AdapterView.OnItemSelectedListener {
        private boolean first = true;
        public void onItemSelected(AdapterView<?> p, View v, int i, long id) { if (first) { first = false; return; } picked(i); }
        public void onNothingSelected(AdapterView<?> p) { }
        abstract void picked(int i);
    }

    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_LONG).show(); }
}
