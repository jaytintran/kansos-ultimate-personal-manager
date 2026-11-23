package com.kanso.workspace;

import android.content.Context;
import android.util.AttributeSet;
import android.view.View;
import com.getcapacitor.CapacitorWebView;

public class KansoWebView extends CapacitorWebView {

    public KansoWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    protected void onWindowVisibilityChanged(int visibility) {
        if (MainActivity.backgroundAudioActive && visibility != View.VISIBLE) {
            super.onWindowVisibilityChanged(View.VISIBLE);
            return;
        }
        super.onWindowVisibilityChanged(visibility);
    }

    @Override
    public void dispatchWindowVisibilityChanged(int visibility) {
        if (MainActivity.backgroundAudioActive && visibility != View.VISIBLE) {
            super.dispatchWindowVisibilityChanged(View.VISIBLE);
            return;
        }
        super.dispatchWindowVisibilityChanged(visibility);
    }

    @Override
    protected void onVisibilityChanged(View changedView, int visibility) {
        if (MainActivity.backgroundAudioActive && visibility != View.VISIBLE) {
            super.onVisibilityChanged(changedView, View.VISIBLE);
            return;
        }
        super.onVisibilityChanged(changedView, visibility);
    }

    @Override
    public int getWindowVisibility() {
        if (MainActivity.backgroundAudioActive) {
            return View.VISIBLE;
        }
        return super.getWindowVisibility();
    }

    @Override
    public boolean isShown() {
        if (MainActivity.backgroundAudioActive) {
            return true;
        }
        return super.isShown();
    }

    @Override
    public void onPause() {
        if (MainActivity.backgroundAudioActive) {
            return;
        }
        super.onPause();
    }

    @Override
    public void pauseTimers() {
        if (MainActivity.backgroundAudioActive) {
            return;
        }
        super.pauseTimers();
    }
}
