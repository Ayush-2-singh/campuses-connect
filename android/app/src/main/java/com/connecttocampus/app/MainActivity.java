package com.connecttocampus.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // BEFORE super.onCreate(): that call is what builds the bridge, and a
        // plugin registered afterwards is never handed to the WebView. This one
        // keeps a live voice call alive while the screen is off.
        registerPlugin(CallKeepAlivePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
