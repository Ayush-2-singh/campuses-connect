package com.connecttocampus.app;

import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * THE WEB SIDE'S HANDLE ON {@link CallKeepAliveService}.
 *
 * Two verbs, driven from src/lib/native/callKeepAlive.ts:
 *   start() — a LiveKit room just connected; hold the screen off and keep the
 *             other person audible until the user leaves.
 *   stop()  — the user left (Leave button, or the page went away): drop the
 *             notification, the wake lock and the service.
 *
 * Both ALWAYS resolve, never reject. Android 12+ forbids starting a foreground
 * service from the background, and a manufacturer build can refuse the type —
 * losing the background call is a degraded state, not a reason to surface an
 * error dialog in the middle of somebody's conversation. The result simply
 * says whether it took, for debugging.
 */
@CapacitorPlugin(name = "CallKeepAlive")
public class CallKeepAlivePlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        JSObject result = new JSObject();
        try {
            Context context = getContext();
            Intent intent = new Intent(context, CallKeepAliveService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
            result.put("started", true);
        } catch (Exception refused) {
            result.put("started", false);
            result.put("reason", String.valueOf(refused.getClass().getSimpleName()));
        }
        call.resolve(result);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            Context context = getContext();
            context.stopService(new Intent(context, CallKeepAliveService.class));
        } catch (Exception ignored) {
            // Already gone — stopping is idempotent by design, because the web
            // side calls it from the leave path and from pagehide.
        }
        call.resolve(new JSObject());
    }
}
