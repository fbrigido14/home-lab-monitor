package br.homelab.monitor;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Reagenda a verificação de alertas depois de reiniciar o celular. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(i.getAction()) && Prefs.server(c) != null) AlertJob.schedule(c);
    }
}
