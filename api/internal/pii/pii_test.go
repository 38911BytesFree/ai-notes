package pii

import (
	"reflect"
	"testing"

	"ainotes/internal/notes"
)

func TestScanPositives(t *testing.T) {
	tests := []struct {
		name          string
		text          string
		expectedFlags []string
	}{
		{
			name:          "Email address",
			text:          "Contact support at user@example.com for assistance.",
			expectedFlags: []string{FlagEmail},
		},
		{
			name:          "Email with plus addressing and subdomain",
			text:          "Send alerts to dev.ops+critical@alerts.internal.corp.io immediately.",
			expectedFlags: []string{FlagEmail},
		},
		{
			name:          "NANP phone with parentheses",
			text:          "Call us at (555) 234-5678 today.",
			expectedFlags: []string{FlagPhone},
		},
		{
			name:          "NANP phone with hyphens",
			text:          "My number is 555-234-5678.",
			expectedFlags: []string{FlagPhone},
		},
		{
			name:          "NANP phone with +1 prefix",
			text:          "Reach out on +1-555-234-5678.",
			expectedFlags: []string{FlagPhone},
		},
		{
			name:          "International phone number",
			text:          "Office in London: +44 20 7183 8750.",
			expectedFlags: []string{FlagPhone},
		},
		{
			name:          "International phone number compact",
			text:          "Direct dial: +49301234567.",
			expectedFlags: []string{FlagPhone},
		},
		{
			name:          "Credit card Luhn-valid",
			text:          "Payment info: 4000-0012-3456-7899 on file.",
			expectedFlags: []string{FlagCreditCard},
		},
		{
			name:          "Private key block",
			text:          "Key config:\n-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----",
			expectedFlags: []string{FlagPrivateKey},
		},
		{
			name:          "JWT token",
			text:          "Authorization token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
			expectedFlags: []string{FlagJWT},
		},
		{
			name:          "OpenAI API key",
			text:          "sk-1234567890abcdefghijklmnopqrstuvwxyz",
			expectedFlags: []string{FlagAPIKey},
		},
		{
			name:          "OpenAI Project API key",
			text:          "sk-proj-abcdefghijklmnopqrstuvwxyz123456",
			expectedFlags: []string{FlagAPIKey},
		},
		{
			name:          "Anthropic API key",
			text:          "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789",
			expectedFlags: []string{FlagAPIKey},
		},
		{
			name:          "GitHub PAT",
			text:          "ghp_1234567890abcdefghijklmnopqrstuvwxyz",
			expectedFlags: []string{FlagAPIKey},
		},
		{
			name:          "GitHub OAuth token",
			text:          "gho_1234567890abcdefghijklmnopqrstuvwxyz",
			expectedFlags: []string{FlagAPIKey},
		},
		{
			name:          "GitHub Fine-grained PAT",
			text:          "github_pat_1234567890abcdefghijklmnopqrstuvwxyz",
			expectedFlags: []string{FlagAPIKey},
		},
		{
			name:          "AWS Access Key ID",
			text:          "AWS credentials: AKIAIOSFODNN7EXAMPLE",
			expectedFlags: []string{FlagAPIKey},
		},
		{
			name:          "Slack token",
			text:          "xoxb-1234567890-abcdefghijk",
			expectedFlags: []string{FlagAPIKey},
		},
		{
			name:          "Google API Key",
			text:          "AIzaSyD-1234567890abcdefghijklmnopqrst",
			expectedFlags: []string{FlagAPIKey},
		},
		{
			name:          "Multiple flags detected and sorted",
			text:          "Email user@example.com with key sk-1234567890abcdefghijklmnopqrstuvwxyz and call (555) 234-5678.",
			expectedFlags: []string{FlagAPIKey, FlagEmail, FlagPhone},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := Scan(tc.text)
			if !reflect.DeepEqual(got, tc.expectedFlags) {
				t.Errorf("Scan(%q) = %v; want %v", tc.text, got, tc.expectedFlags)
			}
		})
	}
}

func TestScanFalsePositiveCorpus(t *testing.T) {
	// Corpus of realistic technical documentation, code snippets, configurations,
	// and numbers that must produce zero flags.
	corpus := []struct {
		name string
		text string
	}{
		{
			name: "Version strings",
			text: "Upgraded from v1.2.3 to 2.0.0-beta.1 and release 3.14.159 with build v1.0.0+20130313144700.",
		},
		{
			name: "UUIDs",
			text: "Session ID 123e4567-e89b-12d3-a456-426614174000 and trace c3fbe4f6-7d4f-4280-a955-a53d9178229b.",
		},
		{
			name: "Git commit SHAs",
			text: "Merged commit 8977939 into main branch (full SHA c3fbe4f67d4f82806955a53d9178229b433cfb9b).",
		},
		{
			name: "Base64 encoded string not a JWT",
			text: "Payload: SGVsbG8gV29ybGQhIEJhc2U2NCBlbmNvZGVkIHN0cmluZy4= and YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=",
		},
		{
			name: "IPv4 and IPv6 addresses",
			text: "Connecting to 1.2.3.4 on port 8080, gateway 192.168.1.1, DNS 10.0.0.1, or 2001:db8::1.",
		},
		{
			name: "Prices and currency",
			text: "Cost is $19.99 per month, discounted to €45.50 or £100.00, enterprise tier $1,200.50.",
		},
		{
			name: "Dates in various formats",
			text: "Updated on 2026-09-06, reviewed 06/09/2026, scheduled 2026/09/06, or 2 Sep 2026.",
		},
		{
			name: "Domains without local part",
			text: "Visit https://example.com, docs at sub.domain.org, or api.openai.com/v1 for references.",
		},
		{
			name: "Mathematical equations and timestamps",
			text: "Pi is approximately 3.141592653589793 and timestamp is 1725624000.",
		},
		{
			name: "Short numbers and ports",
			text: "Open ports: 80, 443, 3000, 5173, 8080. Exit codes: 0, 1, 255.",
		},
		{
			name: "Invalid card numbers (failing Luhn check)",
			text: "Sequence 1234-5678-9012-3456 is not a valid card number.",
		},
	}

	for _, tc := range corpus {
		t.Run(tc.name, func(t *testing.T) {
			got := Scan(tc.text)
			if len(got) > 0 {
				t.Errorf("expected no flags for %s, but got %v for text: %q", tc.name, got, tc.text)
			}
		})
	}
}

func TestScanNoteDeterminism(t *testing.T) {
	note := &notes.Note{
		ID:        "test-note-pii",
		Title:     "Architectural Decisions for Cloud Services",
		Summary:   "Summary describing deployment and configuration.",
		Takeaways: []string{"Step 1: configure environment", "Step 2: deploy containers"},
		Tags:      []string{"cloud", "architecture"},
		CodeBlocks: []notes.CodeBlock{
			{Lang: "bash", Code: "echo 'hello world'"},
		},
	}

	flags1, hash1 := ScanNote(note)
	flags2, hash2 := ScanNote(note)

	if !reflect.DeepEqual(flags1, flags2) {
		t.Fatalf("ScanNote flags not deterministic: %v != %v", flags1, flags2)
	}
	if hash1 != hash2 {
		t.Fatalf("ScanNote hash not deterministic: %s != %s", hash1, hash2)
	}
	if len(flags1) > 0 {
		t.Fatalf("expected clean note, got flags: %v", flags1)
	}

	// Add an email to the summary
	noteWithPII := *note
	noteWithPII.Summary = "Contact admin at security@example.com for access credentials."

	flagsPII, hashPII := ScanNote(&noteWithPII)
	if !reflect.DeepEqual(flagsPII, []string{FlagEmail}) {
		t.Fatalf("expected [email], got %v", flagsPII)
	}
	if hashPII == hash1 {
		t.Fatalf("hash should change when content changes: %s == %s", hashPII, hash1)
	}
}
