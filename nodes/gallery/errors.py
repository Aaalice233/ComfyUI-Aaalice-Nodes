"""Shared Booru Gallery errors exposed through HTTP responses."""


class GalleryTLSCertificateError(RuntimeError):
    """TLS peer verification failed and must not be bypassed or retried."""

    code = "tls_certificate_error"
