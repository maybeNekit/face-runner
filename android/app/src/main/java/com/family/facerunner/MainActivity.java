package com.family.facerunner;

import android.os.Bundle;
import android.view.View;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/**
 * Игра всегда идёт в полноэкранном ландшафте без системных панелей.
 *
 * На targetSdk 36 (Android 16) edge-to-edge обязателен, а старые флаги
 * android:windowFullscreen и SYSTEM_UI_FLAG_* больше не работают —
 * единственный поддерживаемый путь это WindowInsetsControllerCompat.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        enableImmersiveMode();
    }

    /**
     * Система возвращает панели после сворачивания приложения, звонка или
     * системного диалога, поэтому режим переустанавливается при каждом
     * возврате фокуса, а не только один раз в onCreate.
     */
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enableImmersiveMode();
        }
    }

    private void enableImmersiveMode() {
        View decorView = getWindow().getDecorView();

        // Контент рисуется под системными панелями и вырезом камеры.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), decorView);

        controller.hide(WindowInsetsCompat.Type.systemBars());

        // Свайп от края показывает панели поверх игры и прячет их обратно,
        // не меняя размер окна — иначе на каждом свайпе пришлось бы
        // пересчитывать вьюпорт и ловить просадку кадров.
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
