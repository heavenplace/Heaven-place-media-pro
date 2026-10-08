plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Same API origin injection as the listener app — see build-apks.sh.
val apiBaseUrl: String = System.getenv("API_BASE_URL")?.takeIf { it.isNotBlank() } ?: "http://10.0.2.2:8000"

android {
    namespace = "pro.streamcast.controlroom"
    compileSdk = 35

    defaultConfig {
        applicationId = "pro.streamcast.controlroom"
        minSdk = 26
        targetSdk = 35
        versionCode = 3
        versionName = "3.0"
        buildConfigField("String", "API_BASE_URL", "\"$apiBaseUrl\"")
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.10.01")
    implementation(composeBom)

    implementation(project(":core"))
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("io.coil-kt:coil-compose:2.7.0")
}
