package app.nocturne.music

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import android.graphics.Bitmap
import java.io.File
import org.junit.Rule
import org.junit.Test

class NavigationTest {
    @get:Rule(order = 0) val notifications = object : org.junit.rules.ExternalResource() {
        override fun before() {
            if (android.os.Build.VERSION.SDK_INT >= 33) {
                val instrumentation = InstrumentationRegistry.getInstrumentation()
                instrumentation.uiAutomation.executeShellCommand("pm grant ${instrumentation.targetContext.packageName} android.permission.POST_NOTIFICATIONS").use { descriptor ->
                    java.io.FileInputStream(descriptor.fileDescriptor).use { it.readBytes() }
                }
            }
        }
    }
    @get:Rule(order = 1) val compose = createAndroidComposeRule<MainActivity>()

    @Test fun trackToolsWithMockServer() {
        fun waitText(value: String, timeout: Long = 15_000) {
            compose.waitUntil(timeout) { compose.onAllNodesWithText(value).fetchSemanticsNodes(atLeastOneRootRequired = false).isNotEmpty() }
        }
        waitText(tr("Подключиться"))
        compose.onNodeWithText(tr("Адрес сервера")).performTextInput("http://10.0.2.2:4533")
        compose.onNodeWithText(tr("Логин")).performTextInput("test")
        compose.onNodeWithText(tr("Пароль Navidrome")).performTextInput("demo")
        compose.onNodeWithText(tr("Подключиться")).performClick()
        waitText(tr("Недавно добавлено"))
        compose.onNodeWithTag("tab_1").performClick()
        compose.onNodeWithText(tr("Альбомы")).performClick()
        waitText("Mock Album")
        compose.onNodeWithText("Mock Album").performClick()
        waitText(tr("Слушать"))
        compose.onNodeWithTag("detail_list").performScrollToNode(hasTestTag("album_filter"))
        compose.onNodeWithTag("album_filter").performTextInput("трек 3")
        compose.runOnIdle {
            compose.activity.getSystemService(android.view.inputmethod.InputMethodManager::class.java)
                .hideSoftInputFromWindow(compose.activity.window.decorView.windowToken, 0)
        }
        compose.onNodeWithText(tr("Выбрать")).performScrollTo().performClick()
        compose.onNodeWithText(tr("Выбрать все")).performScrollTo().performClick()
        compose.onNodeWithText(tr("Выбрано: {n}", "n" to 1)).assertExists()
        compose.onNodeWithTag("detail_list").performScrollToNode(isToggleable())
        compose.onAllNodes(isToggleable()).onFirst().assertIsOn().performClick().assertIsOff()
        compose.onNodeWithText(tr("Выбрано: {n}", "n" to 0)).assertExists()
        compose.onNodeWithText(tr("Выбрать все")).performClick()
        compose.onNodeWithText(tr("Выбрано: {n}", "n" to 1)).assertExists()
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        fun screenshot(name: String) {
            compose.waitForIdle()
            instrumentation.waitForIdleSync()
            val destination = File(instrumentation.targetContext.getExternalFilesDir(null), name)
            destination.outputStream().use { instrumentation.uiAutomation.takeScreenshot().compress(Bitmap.CompressFormat.PNG, 100, it) }
            instrumentation.uiAutomation.executeShellCommand("cp ${destination.absolutePath} /sdcard/Download/nocturne-$name").use { descriptor ->
                java.io.FileInputStream(descriptor.fileDescriptor).use { it.readBytes() }
            }
        }
        screenshot("track-tools-android.png")
        compose.onNodeWithText(tr("Готово")).performScrollTo().performClick()
        compose.onNodeWithText("Тестовый трек 3").performScrollTo().performClick()
        compose.onAllNodesWithContentDescription(tr("Действия с треком")).onFirst().performClick()
        compose.onNodeWithText(tr("Информация о треке")).performClick()
        compose.onNodeWithText("WAV").assertExists()
        compose.onNodeWithText(tr("Скопировать диагностику")).performClick()
        compose.onNodeWithText(tr("Скопировано")).assertExists()
        screenshot("track-information-android.png")
        compose.onAllNodesWithText(tr("Готово")).onLast().performClick()
        compose.onAllNodesWithContentDescription(tr("Действия с треком")).onFirst().performClick()
        compose.onNodeWithText(tr("Перескачать и перезапустить")).performClick()
        waitText(tr("Загрузка обновлена"), 25_000)
        java.net.URL("http://10.0.2.2:4533/fail-next-stream?id=t2").readText()
        compose.onAllNodesWithContentDescription(tr("Действия с треком")).onFirst().performClick()
        compose.onNodeWithText(tr("Перескачать и перезапустить")).performClick()
        waitText(tr("Не удалось обновить загрузку. Старая копия сохранена."))
        compose.onNodeWithText(tr("Понятно")).performClick()
        compose.onAllNodesWithContentDescription(tr("Действия с треком")).onFirst().performClick()
        compose.onNodeWithText(tr("Информация о треке")).performClick()
        compose.onNodeWithText(tr("Скачанная копия")).assertExists()
    }

    @Test fun demoLibraryAlbumAndSearch() {
        compose.waitUntil(15_000) { compose.onAllNodesWithText(tr("Подключиться")).fetchSemanticsNodes(atLeastOneRootRequired = false).isNotEmpty() }
        compose.onNodeWithText(tr("Подключиться")).assertIsNotEnabled()
        compose.onNodeWithText(tr("Посмотреть демоверсию")).performScrollTo().performClick()
        compose.onNodeWithText(tr("Недавно добавлено")).assertIsDisplayed()
        compose.onNodeWithTag("tab_1").performClick()
        compose.onNodeWithText(tr("Альбомы")).assertIsDisplayed().performClick()
        compose.waitUntil(10_000) { compose.onAllNodesWithText("Параллели").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Параллели").performClick()
        compose.onNodeWithText(tr("Слушать")).performClick()
        compose.onNodeWithText(tr("Это демомедиатека. Подключи Navidrome, чтобы слушать свою музыку.")).assertIsDisplayed()
        compose.onNodeWithText(tr("Понятно")).performClick()
        compose.onNodeWithTag("tab_2").performClick()
        compose.onNode(hasSetTextAction()).performTextInput("Afterglow")
        compose.waitUntil(10_000) { compose.onAllNodesWithText(tr("Треки")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText(tr("Треки")).performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("tab_0").performClick()
        compose.waitForIdle()
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val destination = File(instrumentation.targetContext.getExternalFilesDir(null), "home-android.png")
        destination.outputStream().use { stream ->
            instrumentation.uiAutomation.takeScreenshot().compress(Bitmap.CompressFormat.PNG, 100, stream)
        }
        compose.onNodeWithContentDescription(tr("Настройки")).performClick()
        // Сначала раскрываем шторку жестом: ScrollTo прокручивает содержимое, но не раскрывает её.
        compose.onNodeWithText(tr("Настройки")).performTouchInput {
            swipe(center, center - androidx.compose.ui.geometry.Offset(0f, 600f), 500)
        }
        compose.waitForIdle()
        compose.onNodeWithText(tr("Готовить очередь для офлайна")).performScrollTo().assertIsDisplayed()
        val preparation = compose.onNodeWithTag("offline-preparation")
        preparation.assertIsOff().performClick().assertIsOn()
        org.junit.Assert.assertTrue(Settings(instrumentation.targetContext).prepareQueue)
        val settingsScreenshot = File(instrumentation.targetContext.getExternalFilesDir(null), "offline-settings-android.png")
        settingsScreenshot.outputStream().use { stream ->
            instrumentation.uiAutomation.takeScreenshot().compress(Bitmap.CompressFormat.PNG, 100, stream)
        }
        instrumentation.uiAutomation.executeShellCommand("cp ${settingsScreenshot.absolutePath} /sdcard/Download/nocturne-offline-settings.png").use { descriptor ->
            java.io.FileInputStream(descriptor.fileDescriptor).use { it.readBytes() }
        }
        preparation.performClick().assertIsOff()
    }
}
