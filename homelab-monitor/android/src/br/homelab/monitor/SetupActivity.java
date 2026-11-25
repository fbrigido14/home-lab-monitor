package br.homelab.monitor;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONObject;

/** Primeiro acesso ou troca de servidor: valida o endereço antes de abrir a dashboard. */
public class SetupActivity extends Activity {
    private EditText url;
    private TextView status;
    private Button go;

    @Override
    protected void onCreate(Bundle b) {
        Ui.applyTheme(this);
        super.onCreate(b);
        Ui.bars(this);
        ScrollView sv = new ScrollView(this);
        sv.setBackgroundColor(Ui.bg(this));
        sv.setFillViewport(true);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_VERTICAL);
        int p = Ui.dp(this, 22);
        root.setPadding(p, p, p, p);
        sv.addView(root);

        LinearLayout card = Ui.card(this);
        root.addView(card);
        card.addView(Ui.text(this, "Homelab Monitor", 22, Ui.ink(this), true));
        TextView sub = Ui.text(this, "Informe o endereço da sua dashboard. É o mesmo que você usa no navegador.", 14, Ui.muted(this), false);
        sub.setPadding(0, Ui.dp(this, 6), 0, Ui.dp(this, 14));
        card.addView(sub);

        url = new EditText(this);
        url.setHint("http://192.168.1.13:8080");
        url.setSingleLine(true);
        url.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        url.setImeOptions(EditorInfo.IME_ACTION_GO);
        url.setTextColor(Ui.ink(this));
        url.setHintTextColor(Ui.muted(this));
        String cur = Prefs.server(this);
        if (cur != null) url.setText(cur);
        url.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            public boolean onEditorAction(TextView v, int id, android.view.KeyEvent e) { connect(); return true; }
        });
        card.addView(url);

        go = Ui.button(this, "Conectar", true);
        go.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { connect(); } });
        card.addView(go);

        status = Ui.text(this, "", 13, Ui.muted(this), false);
        status.setPadding(0, Ui.dp(this, 12), 0, 0);
        card.addView(status);

        TextView tip = Ui.text(this, "Dica: fora de casa, acesse pela VPN da UniFi ou por um proxy com HTTPS. "
                + "Certificados autoassinados são aceitos depois que você confirmar a impressão digital.", 12, Ui.muted(this), false);
        root.addView(tip);
        setContentView(sv);
    }

    private String normalize(String s) {
        s = s.trim();
        if (s.isEmpty()) return null;
        if (!s.startsWith("http://") && !s.startsWith("https://")) s = "http://" + s;
        while (s.endsWith("/")) s = s.substring(0, s.length() - 1);
        int hash = s.indexOf('#');
        if (hash > 0) s = s.substring(0, hash);
        return s;
    }

    private void connect() {
        final String u = normalize(url.getText().toString());
        if (u == null) { status.setText("Digite o endereço."); return; }
        go.setEnabled(false);
        status.setTextColor(Ui.muted(this));
        status.setText("Conectando…");
        new Thread(new Runnable() {
            public void run() {
                String msg = null;
                Net.UntrustedCert cert = null;
                try {
                    Net.Response r = Net.get(SetupActivity.this, u + "/api/health", null);
                    boolean ours = false;
                    try { ours = new JSONObject(r.body).has("ok"); } catch (Exception ignored) { }
                    if (!ours) msg = "O endereço respondeu, mas não parece ser o Homelab Monitor (HTTP " + r.code + ").";
                } catch (Exception e) {
                    cert = Net.untrusted(e);
                    if (cert == null) msg = "Não foi possível conectar: " + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
                }
                final String fm = msg;
                final Net.UntrustedCert fc = cert;
                runOnUiThread(new Runnable() {
                    public void run() {
                        go.setEnabled(true);
                        if (fc != null) { askTrust(fc); return; }
                        if (fm != null) { status.setTextColor(Ui.CRIT); status.setText(fm); return; }
                        Prefs.setServer(SetupActivity.this, u);
                        Intent i = new Intent(SetupActivity.this, MainActivity.class);
                        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
                        startActivity(i);
                        finish();
                    }
                });
            }
        }).start();
    }

    private void askTrust(final Net.UntrustedCert c) {
        new AlertDialog.Builder(this)
                .setTitle("Certificado não reconhecido")
                .setMessage("O servidor usa um certificado que o Android não reconhece (comum em homelabs com certificado autoassinado).\n\n"
                        + "Emitido para: " + c.subject + "\n\nImpressão digital SHA-256:\n" + c.fingerprint
                        + "\n\nConfie só se for o certificado do seu servidor. Ele ficará fixado: se mudar, o app avisa de novo.")
                .setPositiveButton("Confiar", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface d, int w) { Prefs.trust(SetupActivity.this, c.fingerprint); connect(); }
                })
                .setNegativeButton("Cancelar", null)
                .show();
    }
}
