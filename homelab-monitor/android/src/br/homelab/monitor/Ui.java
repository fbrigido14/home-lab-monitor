package br.homelab.monitor;

import android.app.Activity;
import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.util.TypedValue;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Tema claro/escuro e componentes visuais com as mesmas cores da dashboard. */
final class Ui {
    private Ui() { }

    static boolean night(Context c) {
        return (c.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    static int bg(Context c) { return night(c) ? 0xFF0F1412 : 0xFFE6EBE8; }
    static int surface(Context c) { return night(c) ? 0xFF171D1A : 0xFFFBFCFB; }
    static int line(Context c) { return night(c) ? 0xFF2B3530 : 0xFFD3DBD6; }
    static int ink(Context c) { return night(c) ? 0xFFE4EBE7 : 0xFF17201C; }
    static int muted(Context c) { return night(c) ? 0xFF95A39C : 0xFF5F6B66; }
    static int accent(Context c) { return night(c) ? 0xFF4FC2B9 : 0xFF116A67; }
    static final int CRIT = 0xFFC2362C, WARN = 0xFFB77A06, OK = 0xFF2C8A52;

    /** Deve ser chamado antes de super.onCreate(): o WebView usa o tema para decidir claro/escuro. */
    static void applyTheme(Activity a) {
        a.setTheme(night(a) ? android.R.style.Theme_Material_NoActionBar : android.R.style.Theme_Material_Light_NoActionBar);
    }

    static void bars(Activity a) {
        a.getWindow().setStatusBarColor(bg(a));
        a.getWindow().setNavigationBarColor(bg(a));
        int flags = 0;
        if (!night(a)) {
            flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= 26) flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        a.getWindow().getDecorView().setSystemUiVisibility(flags);
    }

    static int dp(Context c, float v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, c.getResources().getDisplayMetrics());
    }

    static GradientDrawable round(int color, int stroke, float radius) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(radius);
        if (stroke != 0) g.setStroke(2, stroke);
        return g;
    }

    static TextView text(Context c, String s, float sp, int color, boolean bold) {
        TextView t = new TextView(c);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    static LinearLayout card(Context c) {
        LinearLayout l = new LinearLayout(c);
        l.setOrientation(LinearLayout.VERTICAL);
        int p = dp(c, 16);
        l.setPadding(p, p, p, p);
        l.setBackground(round(surface(c), line(c), dp(c, 14)));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(c, 14);
        l.setLayoutParams(lp);
        return l;
    }

    static Button button(Context c, String s, boolean primary) {
        Button b = new Button(c);
        b.setText(s);
        b.setAllCaps(false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        b.setTextColor(primary ? Color.WHITE : ink(c));
        b.setBackground(round(primary ? accent(c) : surface(c), primary ? 0 : line(c), dp(c, 8)));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(c, 48));
        lp.topMargin = dp(c, 10);
        b.setLayoutParams(lp);
        return b;
    }

    static View space(Context c, int dp) {
        View v = new View(c);
        v.setLayoutParams(new LinearLayout.LayoutParams(1, dp(c, dp)));
        return v;
    }
}
