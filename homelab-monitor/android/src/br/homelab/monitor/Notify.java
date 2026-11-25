package br.homelab.monitor;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import java.util.List;

/** Canais e envio de notificações. Cada canal pode ser ajustado nas configurações do Android. */
final class Notify {
    private Notify() { }

    static final String CH_CRIT = "crit", CH_WARN = "warn", CH_SESSION = "session";
    private static final int FLAG_IMMUTABLE = 0x04000000;   // PendingIntent.FLAG_IMMUTABLE (API 23)

    static void channels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        NotificationChannel crit = new NotificationChannel(CH_CRIT, "Alertas críticos", NotificationManager.IMPORTANCE_HIGH);
        crit.setDescription("Serviços fora do ar, falhas de backup, discos e problemas graves");
        crit.enableVibration(true);
        NotificationChannel warn = new NotificationChannel(CH_WARN, "Avisos", NotificationManager.IMPORTANCE_DEFAULT);
        warn.setDescription("Alertas de atenção: uso alto, temperatura, atualizações pendentes");
        NotificationChannel ses = new NotificationChannel(CH_SESSION, "Conta e sessão", NotificationManager.IMPORTANCE_LOW);
        ses.setDescription("Sessão expirada e avisos do app");
        nm.createNotificationChannel(crit);
        nm.createNotificationChannel(warn);
        nm.createNotificationChannel(ses);
    }

    static boolean allowed(Context c) {
        if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        return c.getSystemService(NotificationManager.class).areNotificationsEnabled();
    }

    static PendingIntent open(Context c, String page, int req) {
        Intent i = new Intent(c, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (page != null) i.putExtra("page", page);
        return PendingIntent.getActivity(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | FLAG_IMMUTABLE);
    }

    private static Notification.Builder builder(Context c, String channel) {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, channel) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat).setAutoCancel(true).setColor(0xFF116A67).setShowWhen(true);
        if (Build.VERSION.SDK_INT < 26) {
            b.setPriority(CH_CRIT.equals(channel) ? Notification.PRIORITY_HIGH : Notification.PRIORITY_DEFAULT);
            if (CH_CRIT.equals(channel)) b.setDefaults(Notification.DEFAULT_ALL);
        }
        return b;
    }

    static void alert(Context c, int id, String level, String title, String text, String page) {
        if (!allowed(c)) return;
        String ch = "crit".equals(level) ? CH_CRIT : CH_WARN;
        Notification n = builder(c, ch)
                .setContentTitle(title).setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setContentIntent(open(c, page, id))
                .setGroup("alerts")
                .build();
        c.getSystemService(NotificationManager.class).notify(id, n);
    }

    static void summary(Context c, List<String> lines, int crit, String page) {
        if (!allowed(c)) return;
        Notification.InboxStyle st = new Notification.InboxStyle();
        for (int i = 0; i < lines.size() && i < 7; i++) st.addLine(lines.get(i));
        if (lines.size() > 7) st.setSummaryText("e mais " + (lines.size() - 7));
        String title = lines.size() + " novos alertas no homelab";
        Notification n = builder(c, crit > 0 ? CH_CRIT : CH_WARN)
                .setContentTitle(title).setContentText(lines.get(0)).setStyle(st)
                .setContentIntent(open(c, page, 9000)).setGroup("alerts").setGroupSummary(true).build();
        c.getSystemService(NotificationManager.class).notify(9000, n);
    }

    static void session(Context c) {
        if (!allowed(c)) return;
        Notification n = builder(c, CH_SESSION)
                .setContentTitle("Entre de novo no Homelab Monitor")
                .setContentText("A sessão expirou; os alertas em segundo plano estão pausados até você entrar.")
                .setContentIntent(open(c, null, 9100)).build();
        c.getSystemService(NotificationManager.class).notify(9100, n);
    }
}
