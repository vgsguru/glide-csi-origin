plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.gms.google-services")
}

android {
    namespace = "app.glide"
    compileSdk = 35

    defaultConfig {
        // Must match the package registered in google-services.json for the
        // Firebase project "manage-buddy". The Kotlin package stays app.glide;
        // only the installed application id changes.
        applicationId = "glide2.com"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    signingConfigs {
        create("release") {
            storeFile = file("glide-release.jks")
            storePassword = "glide2026"
            keyAlias = "glide"
            keyPassword = "glide2026"
        }
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
            // No applicationIdSuffix: google-services.json only registers
            // "glide2.com", and the Google Services plugin hard-fails on any
            // id it cannot find a client for.
            //
            // Same key as release, deliberately. Both variants share one
            // application id, so differing signatures would make installing one
            // over the other fail with INSTALL_FAILED_UPDATE_INCOMPATIBLE --
            // which Android reports to the user as a bare "App not installed".
            signingConfig = signingConfigs.getByName("release")
        }
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.activity:activity-compose:1.9.3")

    val composeBom = platform("androidx.compose:compose-bom:2024.10.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    // On-device OCR for bill photos: free, no key, and the photo never leaves
    // the phone. The unbundled variant keeps the model in Play Services rather
    // than in the APK -- the bundled one added 40MB because it ships native
    // libraries for all four ABIs. Recognition still runs on-device.
    implementation("com.google.android.gms:play-services-mlkit-text-recognition:19.0.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0")

    // Firebase Auth drags in an old androidx.fragment transitively, which
    // breaks the ActivityResult APIs used for the SMS permission request.
    // Pinning it forward is the fix; suppressing the lint error is not.
    implementation("androidx.fragment:fragment:1.8.5")

    // Firebase — project "manage-buddy"
    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    implementation("com.google.firebase:firebase-analytics")
    implementation("com.google.firebase:firebase-auth")
    implementation("com.google.firebase:firebase-firestore")

    debugImplementation("androidx.compose.ui:ui-tooling")

    testImplementation("junit:junit:4.13.2")
}
