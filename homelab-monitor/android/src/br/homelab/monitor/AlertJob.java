package br.homelab.monitor;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Consulta /api/summary em segundo plano, avisa alertas novos e atualiza o widget.
 * Usa a mesma sessão do WebView (cookie), então respeita login e 2FA.
 */
public class AlertJob extends JobService {
    static final int PERIODIC = 1001, NOW = 1002;

    static void schedule(Context c) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        if ("off".equals(Prefs.notifyLevel(c)) && !StatusWidget.hasWidgets(c)) {
            js.cancel(PERIODIC);
            return;
        }
        JobInfo job = new JobInfo.Builder(PERIODIC, new ComponentName(c, AlertJob.class))
                .setPeriodic(Math.max(15, Prefs.intervalMin(c)) * 60_000L)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .build();
        js.schedule(job);
    }

    static void runNow(Context c) {
        JobInfo job = new JobInfo.Builder(NOW, new ComponentName(c, AlertJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setOverrideDeadline(5_000)
                .build();
        c.getSystemService(JobScheduler.class).schedule(job);
    }

    @Override
    public boolean onStartJob(final JobParameters params) {
        new Thread(new Runnable() {
            public void run() {
                try {
                    check(getApplicationContext());
                } catch (Throwable ignored) {
                    // sem rede ou servidor fora: tenta de novo no próximo ciclo
                }
                jobFinished(params, false);
            }
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) { return true; }

    static void check(Context c) throws Exception {
        String server = Prefs.server(c), cookie = Prefs.cookie(c);
        if (server == null) return;
        Net.Response r = Net.get(c, server + "/api/summary", cookie);
        if (r.code == 401 || r.code == 403) {
            if (!Prefs.p(c).getBoolean("session_warned", false)) {
                Notify.session(c);
                Prefs.p(c).edit().putBoolean("session_warned", true).apply();
            }
            return;
        }
        if (r.code != 200) return;
        Prefs.p(c).edit().putBoolean("session_warned", false).apply();
        Prefs.setSummary(c, r.body);
        StatusWidget.updateAll(c);

        String level = Prefs.notifyLevel(c);
        JSONObject s = new JSONObject(r.body);
        JSONArray evs = s.optJSONArray("events");
        Set<String> now = new HashSet<>();
        List<JSONObject> fresh = new ArrayList<>();
        Set<String> seen = Prefs.seen(c);
        boolean init = Prefs.seenInit(c);
        for (int i = 0; evs != null && i < evs.length(); i++) {
            JSONObject e = evs.getJSONObject(i);
            String lv = e.optString("level");
            if (!"crit".equals(lv) && !("warn".equals(lv) && "warn".equals(level))) continue;
            String key = lv + "|" + e.optString("source") + "|" + e.optString("title");
            now.add(key);
            if (init && !seen.contains(key)) fresh.add(e);
        }
        Prefs.setSeen(c, now);   // na primeira vez só memoriza o que já estava ativo
        if ("off".equals(level) || fresh.isEmpty()) return;
        if (fresh.size() <= 3) {
            for (JSONObject e : fresh) {
                String t = e.optString("title");
                Notify.alert(c, ("n" + e.optString("source") + t).hashCode(), e.optString("level"), t,
                        e.optString("detail"), e.optString("source"));
            }
        } else {
            List<String> lines = new ArrayList<>();
            int crit = 0;
            for (JSONObject e : fresh) {
                lines.add(("crit".equals(e.optString("level")) ? "● " : "○ ") + e.optString("title"));
                if ("crit".equals(e.optString("level"))) crit++;
            }
            Notify.summary(c, lines, crit, "visao");
        }
    }
}
