package br.homelab.monitor;

import android.content.Context;
import android.net.http.SslCertificate;
import android.os.Build;
import android.os.Bundle;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.Set;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSession;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;

/**
 * HTTP com suporte a certificado autoassinado: só é aceito se a impressão digital
 * SHA-256 do certificado tiver sido confirmada pela pessoa (fixação de certificado).
 */
final class Net {
    private Net() { }

    static final class Response {
        final int code; final String body;
        Response(int code, String body) { this.code = code; this.body = body; }
    }

    /** Certificado não confiável: carrega a impressão digital para a pessoa decidir. */
    static final class UntrustedCert extends CertificateException {
        final String fingerprint, subject;
        UntrustedCert(String fp, String subject) { super("Certificado não confiável"); this.fingerprint = fp; this.subject = subject; }
    }

    static String fingerprint(X509Certificate cert) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(cert.getEncoded());
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < d.length; i++) {
                if (i > 0) sb.append(':');
                sb.append(String.format("%02X", d[i]));
            }
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }

    /** Converte o certificado que o WebView entrega para X509. */
    static X509Certificate fromSsl(SslCertificate c) {
        if (c == null) return null;
        try {
            if (Build.VERSION.SDK_INT >= 29) return c.getX509Certificate();
            Bundle b = SslCertificate.saveState(c);
            byte[] der = b.getByteArray("x509-certificate");
            if (der == null) return null;
            return (X509Certificate) CertificateFactory.getInstance("X.509").generateCertificate(new ByteArrayInputStream(der));
        } catch (Exception e) {
            return null;
        }
    }

    private static final class PinTrust implements X509TrustManager {
        private final X509TrustManager sys; private final Set<String> pins;
        PinTrust(X509TrustManager sys, Set<String> pins) { this.sys = sys; this.pins = pins; }
        public void checkClientTrusted(X509Certificate[] chain, String auth) throws CertificateException { sys.checkClientTrusted(chain, auth); }
        public void checkServerTrusted(X509Certificate[] chain, String auth) throws CertificateException {
            try {
                sys.checkServerTrusted(chain, auth);
            } catch (CertificateException e) {
                String fp = fingerprint(chain[0]);
                if (!pins.contains(fp)) throw new UntrustedCert(fp, chain[0].getSubjectX500Principal().getName());
            }
        }
        public X509Certificate[] getAcceptedIssuers() { return sys.getAcceptedIssuers(); }
    }

    static Response get(Context c, String url, String cookie) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        if (con instanceof HttpsURLConnection) {
            final Set<String> pins = Prefs.trusted(c);
            TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
            tmf.init((KeyStore) null);
            X509TrustManager sys = null;
            for (TrustManager tm : tmf.getTrustManagers()) if (tm instanceof X509TrustManager) sys = (X509TrustManager) tm;
            SSLContext ctx = SSLContext.getInstance("TLS");
            ctx.init(null, new TrustManager[]{new PinTrust(sys, pins)}, null);
            HttpsURLConnection https = (HttpsURLConnection) con;
            https.setSSLSocketFactory(ctx.getSocketFactory());
            final HostnameVerifier def = HttpsURLConnection.getDefaultHostnameVerifier();
            https.setHostnameVerifier(new HostnameVerifier() {
                public boolean verify(String host, SSLSession s) {
                    if (def.verify(host, s)) return true;
                    try {   // certificado fixado pela pessoa: o nome pode não bater (ex.: acesso por IP)
                        return pins.contains(fingerprint((X509Certificate) s.getPeerCertificates()[0]));
                    } catch (Exception e) {
                        return false;
                    }
                }
            });
        }
        con.setConnectTimeout(10000);
        con.setReadTimeout(20000);
        con.setRequestProperty("Accept", "application/json");
        con.setRequestProperty("User-Agent", "HomelabMonitorApp/" + BuildInfo.VERSION);
        if (cookie != null) con.setRequestProperty("Cookie", cookie);
        con.setInstanceFollowRedirects(false);
        try {
            int code = con.getResponseCode();
            InputStream in = code >= 400 ? con.getErrorStream() : con.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            if (in != null) {
                byte[] buf = new byte[8192];
                int n, total = 0;
                while ((n = in.read(buf)) > 0 && total < 2_000_000) { out.write(buf, 0, n); total += n; }
                in.close();
            }
            return new Response(code, out.toString("UTF-8"));
        } finally {
            con.disconnect();
        }
    }

    /** Procura UntrustedCert na cadeia de causas da exceção. */
    static UntrustedCert untrusted(Throwable t) {
        while (t != null) {
            if (t instanceof UntrustedCert) return (UntrustedCert) t;
            t = t.getCause();
        }
        return null;
    }

    static String origin(String url) {
        try {
            URL u = new URL(url);
            int port = u.getPort();
            return (u.getProtocol() + "://" + u.getHost() + (port > 0 && port != u.getDefaultPort() ? ":" + port : "")).toLowerCase();
        } catch (Exception e) {
            return "";
        }
    }
}
