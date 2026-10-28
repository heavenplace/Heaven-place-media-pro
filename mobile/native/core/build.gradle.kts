// Shared by both apps: the API client, the signed-in session and the UI kit.
// These are `api(...)` dependencies: the apps compile against Compose, OkHttp and Coil
// through this module.
plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "pro.streamcast.core"
    compileSdk = 35

    defaultConfig {
        minSdk = 26
    }

    buildFeatures {
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.10.01")
    api(composeBom)

    api("androidx.core:core-ktx:1.13.1")
    api("androidx.activity:activity-compose:1.9.3")
    api("androidx.compose.ui:ui")
    api("androidx.compose.foundation:foundation")
    api("androidx.compose.material3:material3")
    api("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    api("com.squareup.okhttp3:okhttp:4.12.0")
    api("io.coil-kt:coil-compose:2.7.0")
}
