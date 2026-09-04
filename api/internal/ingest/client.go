package ingest

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"strings"
	"time"
)

var (
	ErrUnsupportedProvider = errors.New("unsupported provider")
	ErrOffListHost         = errors.New("off-list host rejected")
	ErrTooManyRedirects    = errors.New("too many redirects")
	ErrNonPublicIP         = errors.New("dial to non-public IP rejected")
	ErrResponseTooLarge    = errors.New("response body exceeds 5MB limit")
)

const MaxBodyBytes int64 = 5 * 1024 * 1024 // 5 MB

var DefaultAllowlist = []string{
	"chatgpt.com",
	"chat.openai.com",
	"claude.ai",
}

type ClientConfig struct {
	Allowlist     []string
	AllowLoopback bool
	Timeout       time.Duration
}

func isAllowedHost(host string, allowlist []string) bool {
	h := strings.ToLower(host)
	if strings.Contains(h, ":") {
		if parsedHost, _, err := net.SplitHostPort(h); err == nil {
			h = parsedHost
		}
	}
	for _, allowed := range allowlist {
		if h == strings.ToLower(allowed) {
			return true
		}
	}
	return false
}

func isPublicIP(ip net.IP, allowLoopback bool) bool {
	if ip == nil {
		return false
	}
	addr, ok := netip.AddrFromSlice(ip)
	if !ok || !addr.IsValid() {
		return false
	}
	addr = addr.Unmap()

	if allowLoopback && addr.IsLoopback() {
		return true
	}
	if addr.IsLoopback() || addr.IsPrivate() || addr.IsLinkLocalUnicast() || addr.IsLinkLocalMulticast() || addr.IsUnspecified() || addr.IsMulticast() {
		return false
	}
	return true
}

type limitReadCloser struct {
	rc    io.ReadCloser
	limit int64
	read  int64
}

func (l *limitReadCloser) Read(p []byte) (int, error) {
	if l.read >= l.limit {
		return 0, ErrResponseTooLarge
	}
	maxToRead := l.limit - l.read + 1
	if int64(len(p)) > maxToRead {
		p = p[:maxToRead]
	}
	n, err := l.rc.Read(p)
	l.read += int64(n)
	if l.read > l.limit {
		return n, ErrResponseTooLarge
	}
	return n, err
}

func (l *limitReadCloser) Close() error {
	return l.rc.Close()
}

type safeTransport struct {
	base      http.RoundTripper
	allowlist []string
}

func (t *safeTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if len(t.allowlist) > 0 && !isAllowedHost(req.URL.Hostname(), t.allowlist) {
		return nil, fmt.Errorf("%w: %s", ErrOffListHost, req.URL.Hostname())
	}
	resp, err := t.base.RoundTrip(req)
	if err != nil {
		return nil, err
	}
	if resp.ContentLength > MaxBodyBytes {
		resp.Body.Close()
		return nil, ErrResponseTooLarge
	}
	resp.Body = &limitReadCloser{rc: resp.Body, limit: MaxBodyBytes}
	return resp, nil
}

func NewClient(allowlist []string) *http.Client {
	return NewClientWithConfig(ClientConfig{
		Allowlist:     allowlist,
		AllowLoopback: false,
		Timeout:       20 * time.Second,
	})
}

func NewClientWithConfig(cfg ClientConfig) *http.Client {
	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = 20 * time.Second
	}

	dialer := &net.Dialer{
		Timeout:   10 * time.Second,
		KeepAlive: 30 * time.Second,
	}

	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}

			ips, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
			if err != nil {
				return nil, err
			}

			var dialIP net.IP
			for _, ip := range ips {
				if isPublicIP(ip, cfg.AllowLoopback) {
					dialIP = ip
					break
				}
			}

			if dialIP == nil {
				return nil, fmt.Errorf("%w for host %s", ErrNonPublicIP, host)
			}

			target := net.JoinHostPort(dialIP.String(), port)
			return dialer.DialContext(ctx, network, target)
		},
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}

	return &http.Client{
		Transport: &safeTransport{
			base:      transport,
			allowlist: cfg.Allowlist,
		},
		Timeout: timeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return ErrTooManyRedirects
			}
			if len(cfg.Allowlist) > 0 && !isAllowedHost(req.URL.Hostname(), cfg.Allowlist) {
				return fmt.Errorf("%w: redirect to %s rejected", ErrOffListHost, req.URL.Hostname())
			}
			return nil
		},
	}
}
