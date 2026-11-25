#!/bin/sh
# Compila o APK sem Gradle, só com as ferramentas do Ubuntu/Debian:
#   sudo apt install openjdk-17-jdk-headless android-sdk-platform-23 aapt dalvik-exchange zipalign apksigner
# e a android.jar da API 34 (só para compilar; não vai dentro do APK):
#   curl -L -o android-34.jar https://raw.githubusercontent.com/Sable/android-platforms/master/android-34/android.jar
set -e
cd "$(dirname "$0")"
ANDROID_JAR=${ANDROID_JAR:-./android-34.jar}           # APIs (compilação Java)
FRAMEWORK_RES=${FRAMEWORK_RES:-/usr/lib/android-sdk/platforms/android-23/android.jar}   # recursos (aapt)
KEYSTORE=${KEYSTORE:-./homelab-monitor.jks}
OUT=build
[ -f "$ANDROID_JAR" ] || { echo "Falta $ANDROID_JAR (veja o cabeçalho deste script)"; exit 1; }
rm -rf "$OUT" && mkdir -p "$OUT/gen" "$OUT/classes"

echo "› recursos"
aapt package -f -m -J "$OUT/gen" -M AndroidManifest.xml -S res -I "$FRAMEWORK_RES" -F "$OUT/base.apk"

echo "› Java"
javac -nowarn -Xlint:-options --release 8 -encoding UTF-8 -d "$OUT/classes" -cp "$ANDROID_JAR" \
  $(find src -name '*.java') $(find "$OUT/gen" -name '*.java')

echo "› dex"
dalvik-exchange --dex --min-sdk-version=24 --output="$OUT/classes.dex" "$OUT/classes"

echo "› empacotar e alinhar"
cp "$OUT/base.apk" "$OUT/unaligned.apk"
(cd "$OUT" && zip -q unaligned.apk classes.dex)
zipalign -f 4 "$OUT/unaligned.apk" "$OUT/aligned.apk"

echo "› assinar"
if [ ! -f "$KEYSTORE" ]; then
  echo "  gerando chave de assinatura em $KEYSTORE (guarde-a: atualizações precisam da mesma chave)"
  keytool -genkeypair -keystore "$KEYSTORE" -storepass "${KS_PASS:-homelab}" -keypass "${KS_PASS:-homelab}" -alias homelab \
    -keyalg RSA -keysize 3072 -validity 10000 -dname "CN=Homelab Monitor, O=Homelab" >/dev/null 2>&1
fi
apksigner sign --ks "$KEYSTORE" --ks-pass "pass:${KS_PASS:-homelab}" --ks-key-alias homelab --out homelab-monitor.apk "$OUT/aligned.apk"
apksigner verify homelab-monitor.apk
echo "✓ homelab-monitor.apk pronto ($(du -h homelab-monitor.apk | cut -f1))"
