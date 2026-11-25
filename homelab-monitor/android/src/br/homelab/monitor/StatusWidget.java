package br.homelab.monitor;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Widget da tela inicial: estado geral, alertas e consumo. */
public class StatusWidget extends AppWidgetProvider {
    private static final int FLAG_IMMUTABLE = 0x04000000;

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        updateAll(c);
        if (Prefs.server(c) != null) {
            AlertJob.schedule(c);
            AlertJob.runNow(c);
        }
    }

    @Override
    public void onDisabled(Context c) { AlertJob.schedule(c); }

    static boolean hasWidgets(Context c) {
        return AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c, StatusWidget.class)).length > 0;
    }

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, StatusWidget.class));
        if (ids.length == 0) return;
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget);
        Intent i = new Intent(c, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        v.setOnClickPendingIntent(R.id.root, PendingIntent.getActivity(c, 7000, i, PendingIntent.FLAG_UPDATE_CURRENT | FLAG_IMMUTABLE));
        String json = Prefs.summary(c);
        if (json == null) {
            v.setTextViewText(R.id.health, Prefs.server(c) == null ? "Abra o app" : "Aguardando dados");
            v.setTextViewText(R.id.alerts, "Toque para abrir");
            v.setTextViewText(R.id.energy, "");
        } else {
            try {
                JSONObject s = new JSONObject(json);
                String h = s.optString("health");
                JSONObject cnt = s.optJSONObject("counts"), hosts = s.optJSONObject("hosts"), en = s.optJSONObject("energy");
                int crit = cnt == null ? 0 : cnt.optInt("crit"), warn = cnt == null ? 0 : cnt.optInt("warn");
                int color = "crit".equals(h) ? Ui.CRIT : "warn".equals(h) ? 0xFFE3A634 : 0xFF4DBB78;
                v.setTextViewText(R.id.title, s.optString("app_name", "Homelab Monitor"));
                v.setTextViewText(R.id.health, "crit".equals(h) ? "Crítico" : "warn".equals(h) ? "Atenção" : "Tudo certo");
                v.setTextColor(R.id.health, color);
                v.setInt(R.id.dot, "setColorFilter", color);
                String first = "";
                if (s.optJSONArray("events") != null && s.optJSONArray("events").length() > 0) first = " · " + s.optJSONArray("events").getJSONObject(0).optString("title");
                v.setTextViewText(R.id.alerts, (crit + warn == 0 ? "Nenhum alerta" : crit + " crítico(s), " + warn + " aviso(s)" + first));
                String energy = "";
                if (hosts != null) energy = hosts.optInt("online") + " de " + hosts.optInt("total") + " equipamentos online";
                if (en != null && en.has("watts")) {
                    NumberFormat money = NumberFormat.getCurrencyInstance(new Locale("pt", "BR"));
                    energy += " · " + Math.round(en.optDouble("watts")) + " W · " + money.format(en.optDouble("per_hour")) + "/h";
                }
                v.setTextViewText(R.id.energy, energy);
                v.setTextViewText(R.id.updated, new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(Prefs.summaryAt(c))));
            } catch (Exception e) {
                v.setTextViewText(R.id.health, "Sem dados");
            }
        }
        m.updateAppWidget(ids, v);
    }
}
