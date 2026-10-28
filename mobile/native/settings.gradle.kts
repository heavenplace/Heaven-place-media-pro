// Two native Android apps share one API/UI core:
//   :listener -> StreamCast Pro          (pro.streamcast.listener)
//   :admin    -> StreamCast Control Room (pro.streamcast.controlroom)
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "streamcast-android"
include(":core", ":listener", ":admin")
