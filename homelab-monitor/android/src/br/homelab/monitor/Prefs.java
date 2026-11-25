package br.homelab.monitor;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.HashSet;
import java.util.Set;

/** Preferências do app (arquivo privado, fora de backups). */
final class Prefs {
    private Prefs() { }

    static SharedPreferences p(Context c) {
        return c.getApplicationContext().getSharedPreferences("hm", Context.MODE_PRIVATE);
    }

    static String server(Context c) { return p(c).getString("server", null); }
    static void setServer(Context c, String url) { p(c).edit().putString("server", url).remove("cookie").remove("seen").remove("seen_init").apply(); }

    static String cookie(Context c) { return p(c).getString("cookie", null); }
    static void setCookie(Context c, String v) { p(c).edit().putString("cookie", v).apply(); }

    /** crit = só críticos, warn = críticos e avisos, off = desligado */
    static String notifyLevel(Context c) { return p(c).getString("notify", "warn"); }
    static int intervalMin(Context c) { return p(c).getInt("interval", 15); }
    static boolean lock(Context c) { return p(c).getBoolean("lock", false); }
    static int lockTimeoutSec(Context c) { return p(c).getInt("lock_timeout", 60); }

    static Set<String> trusted(Context c) { return new HashSet<>(p(c).getStringSet("trusted", new HashSet<String>())); }
    static void trust(Context c, String fp) {
        Set<String> s = trusted(c);
        s.add(fp);
        p(c).edit().putStringSet("trusted", s).apply();
    }
    static void clearTrusted(Context c) { p(c).edit().remove("trusted").apply(); }

    static Set<String> seen(Context c) { return new HashSet<>(p(c).getStringSet("seen", new HashSet<String>())); }
    static void setSeen(Context c, Set<String> s) { p(c).edit().putStringSet("seen", s).putBoolean("seen_init", true).apply(); }
    static boolean seenInit(Context c) { return p(c).getBoolean("seen_init", false); }

    static String summary(Context c) { return p(c).getString("summary", null); }
    static void setSummary(Context c, String json) { p(c).edit().putString("summary", json).putLong("summary_at", System.currentTimeMillis()).apply(); }
    static long summaryAt(Context c) { return p(c).getLong("summary_at", 0); }
}
