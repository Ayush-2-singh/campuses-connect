package com.connecttocampus.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;

/**
 * KEEPS A LIVE VOICE CALL ALIVE WITH THE SCREEN OFF.
 *
 * WHY THIS EXISTS
 *
 * The app is a Capacitor shell around the deployed site, and the voice room is
 * a LiveKit WebRTC session running inside the WebView. Backgrounding the app
 * (or simply letting the screen time out) moves this process into the cached
 * state, where Android is free to freeze it and drop the CPU to sleep: the
 * audio thread stops, the DTLS/SRTP heartbeat stops, and the other person goes
 * silent mid-sentence — even though the page, and the room, never left.
 *
 * A foreground service is the supported answer to exactly that. While it runs:
 *   • the process is exempt from the cached-app freezer,
 *   • PARTIAL_WAKE_LOCK keeps the CPU awake so WebRTC keeps encoding/decoding,
 *   • a WifiLock keeps Wi-Fi from sleeping between packets,
 *   • the notification tells the user the call is still on (tapping it
 *     returns to the call screen).
 *
 * The room still ends ONLY when the user ends it: leaving is the Leave button
 * or closing the app's page, never the screen turning off. The WebView itself
 * is never paused — Capacitor's Bridge.onPause() only notifies plugins, so JS
 * timers, the presence heartbeat and LiveKit's own keepsalives all keep
 * running underneath this service.
 *
 * Started/stopped by {@link CallKeepAlivePlugin}, which CallProvider drives
 * from the web side: start when the room connects, stop when the user leaves.
 */
public class CallKeepAliveService extends Service {

    /** LOW importance: the call is visible, the notification is not noisy. */
    public static final String CHANNEL_ID = "call_keep_alive";
    public static final String CHANNEL_NAME = "Voice call";
    public static final int NOTIFICATION_ID = 0xCA11; // "CALL"

    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        acquireLocks();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        int type = foregroundServiceType();
        Notification notification = buildNotification();

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // API 29+ requires the type mask to match the manifest, and
                // API 34+ enforces it: pass only what we are allowed to use.
                try {
                    startForeground(NOTIFICATION_ID, notification, type);
                } catch (SecurityException denied) {
                    // A microphone-type service needs RECORD_AUDIO to be
                    // GRANTED right now — somebody who joined without a mic
                    // must not crash over it. Playback-only still keeps the
                    // room alive and the other person audible.
                    startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
                }
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Exception unexpected) {
            // Android 12+ refuses a background start, and a policy check can
            // refuse the type. Never take the app down over a background call.
            stopSelf();
        }

        // Not STICKY: without the web side's start() there is no call to keep
        // alive, so resurrecting this service would strand the notification.
        return START_NOT_STICKY;
    }

    /**
     * Which foreground types to declare for this start. Microphone is the
     * honest one for a call (and keeps the mic indicator truthful), but it is
     * only legal while RECORD_AUDIO is actually granted — see the fallback in
     * onStartCommand.
     */
    private int foregroundServiceType() {
        boolean micGranted = false;
        try {
            micGranted = checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)
                    == android.content.pm.PackageManager.PERMISSION_GRANTED;
        } catch (Exception ignored) {
            // checkSelfPermission only exists on API 23+; minSdk here is 24,
            // so this is belt and braces for odd OEM builds.
        }

        int playback = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
        if (!micGranted) return playback;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return playback | ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
        }
        return playback;
    }

    private void createChannel() {
        try {
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return;
            NotificationChannel channel =
                    new NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW);
            channel.setShowBadge(false);
            channel.setSound(null, null);
            manager.createNotificationChannel(channel);
        } catch (Exception ignored) {
            // A device without channels still runs the service; only the
            // notification's polish is lost.
        }
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent content = PendingIntent.getActivity(this, 0, open, flags);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Voice call is on")
                .setContentText("Screen can be off — you are still connected")
                .setContentIntent(content)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .build();
    }

    /** Keeps the CPU awake: WebRTC cannot decode (or even answer STUN) asleep. */
    private void acquireLocks() {
        try {
            PowerManager power = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (power != null) {
                wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "connecttocampus:voicecall");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire();
            }
        } catch (Exception ignored) {
            // Without the lock the call still works while the user is holding
            // the device; only a very aggressive doze could interrupt it.
        }

        try {
            WifiManager wifi = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifi != null) {
                wifiLock = wifi.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "connecttocampus:voicewifi");
                wifiLock.setReferenceCounted(false);
                wifiLock.acquire();
            }
        } catch (Exception ignored) {
            // Wi-Fi stays on for most devices anyway; never fail over it.
        }
    }

    private void releaseLocks() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) {
        }
        try {
            if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
        } catch (Exception ignored) {
        }
        wakeLock = null;
        wifiLock = null;
    }

    @Override
    public void onDestroy() {
        // The user pressed Leave (or the page closed): drop the notification
        // and the locks so nothing lingers after the call is over.
        try {
            stopForeground(true);
        } catch (Exception ignored) {
        }
        releaseLocks();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null; // started, not bound — the web side only flips it on/off
    }
}
