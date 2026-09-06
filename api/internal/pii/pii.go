package pii

import (
	"crypto/sha256"
	"encoding/hex"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode"

	"ainotes/internal/notes"
)

const (
	FlagEmail      = "email"
	FlagPhone      = "phone"
	FlagCreditCard = "credit_card"
	FlagPrivateKey = "private_key"
	FlagJWT        = "jwt"
	FlagAPIKey     = "api_key"
)

var (
	// Email: standard RFC 5322-compatible pattern requiring local part, @, domain, and TLD of >= 2 chars.
	emailRegex = regexp.MustCompile(`(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b`)

	// Private keys: standard PEM private key header block.
	privateKeyRegex = regexp.MustCompile(`-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----`)

	// JWT: Three Base64URL-encoded segments separated by dots.
	// In practice JWTs header and payload start with "eyJ" (encoding of {"...).
	jwtRegex = regexp.MustCompile(`\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b`)

	// API Keys: recognised shapes for OpenAI, Anthropic, GitHub, AWS, Slack, and Google.
	apiKeysRegex = regexp.MustCompile(`\b(` +
		`sk-[a-zA-Z0-9_-]{20,}` + // OpenAI (legacy sk-..., project sk-proj-...)
		`|sk-ant-[a-zA-Z0-9_-]{20,}` + // Anthropic
		`|ghp_[a-zA-Z0-9]{36}` + // GitHub Personal Access Token
		`|gho_[a-zA-Z0-9]{36}` + // GitHub OAuth Token
		`|github_pat_[a-zA-Z0-9_]{22,}` + // GitHub Fine-Grained PAT
		`|(?:AKIA|ASIA)[0-9A-Z]{16}` + // AWS Access Key ID
		`|xox[bpa]-[0-9a-zA-Z-]{10,}` + // Slack Token
		`|AIza[0-9A-Za-z_-]{30,}` + // Google API Key
		`)\b`)

	// NANP phone numbers: optional +1, 3-digit area code (first digit 2-9), 3-digit exchange (first digit 2-9), 4-digit line.
	// Bound to not match if preceded by word char, dot, slash, colon, or dollar sign.
	nanpPhoneRegex = regexp.MustCompile(`(?:^|[^\w.+/$:])(?:\+?1[-. ]?)?\(?([2-9]\d{2})\)?[-. ]?([2-9]\d{2})[-. ]?(\d{4})(?:$|[^\w])`)

	// International E.164 phone numbers with + prefix: e.g. +44 7911 123456, +44-20-7183-8750, +49301234567.
	intlPhoneRegex = regexp.MustCompile(`(?:^|[^\w.+/$:])\+([1-9]\d{0,3})[-. ]?(\d{1,4})[-. ]?(\d{2,4})[-. ]?(\d{2,9})(?:$|[^\w])`)

	// Credit card candidate: 13-19 digits with optional spaces or dashes.
	cardCandidateRegex = regexp.MustCompile(`(?:^|[^\w])(\d(?:[ -]?\d){12,18})(?:$|[^\w])`)
)

// Scan inspects text and returns a sorted, deduplicated slice of detected PII flag names.
func Scan(text string) []string {
	if text == "" {
		return []string{}
	}

	detected := make(map[string]bool)

	if emailRegex.MatchString(text) {
		detected[FlagEmail] = true
	}

	if privateKeyRegex.MatchString(text) {
		detected[FlagPrivateKey] = true
	}

	if jwtRegex.MatchString(text) {
		detected[FlagJWT] = true
	}

	if apiKeysRegex.MatchString(text) {
		detected[FlagAPIKey] = true
	}

	if scanPhone(text) {
		detected[FlagPhone] = true
	}

	if scanCreditCard(text) {
		detected[FlagCreditCard] = true
	}

	flags := make([]string, 0, len(detected))
	for f := range detected {
		flags = append(flags, f)
	}
	sort.Strings(flags)
	return flags
}

// scanPhone checks for valid NANP and International phone formats while avoiding false positives.
func scanPhone(text string) bool {
	if nanpPhoneRegex.MatchString(text) {
		return true
	}
	if intlPhoneRegex.MatchString(text) {
		return true
	}
	return false
}

// scanCreditCard finds digit groups and validates them using the Luhn algorithm.
func scanCreditCard(text string) bool {
	matches := cardCandidateRegex.FindAllStringSubmatch(text, -1)
	for _, m := range matches {
		if len(m) < 2 {
			continue
		}
		raw := m[1]
		var digits []int
		for _, r := range raw {
			if unicode.IsDigit(r) {
				d, _ := strconv.Atoi(string(r))
				digits = append(digits, d)
			}
		}

		if len(digits) < 13 || len(digits) > 19 {
			continue
		}

		// Avoid all identical digits (e.g. 0000-0000-0000-0000)
		allSame := true
		for i := 1; i < len(digits); i++ {
			if digits[i] != digits[0] {
				allSame = false
				break
			}
		}
		if allSame {
			continue
		}

		if luhnValid(digits) {
			return true
		}
	}
	return false
}

// luhnValid computes the Luhn (mod 10) checksum over digits.
func luhnValid(digits []int) bool {
	sum := 0
	alt := false
	for i := len(digits) - 1; i >= 0; i-- {
		n := digits[i]
		if alt {
			n *= 2
			if n > 9 {
				n -= 9
			}
		}
		sum += n
		alt = !alt
	}
	return sum%10 == 0
}

// ScanNote extracts all scanned text fields from a note, computes its canonical SHA-256 hash,
// and returns the sorted PII flags and the hash.
func ScanNote(n *notes.Note) ([]string, string) {
	if n == nil {
		h := sha256.Sum256([]byte(""))
		return []string{}, hex.EncodeToString(h[:])
	}

	parts := make([]string, 0, 2+len(n.Takeaways)+len(n.Tags)+len(n.CodeBlocks))
	parts = append(parts, n.Title)
	parts = append(parts, n.Summary)
	parts = append(parts, n.Takeaways...)
	parts = append(parts, n.Tags...)
	for _, cb := range n.CodeBlocks {
		parts = append(parts, cb.Code)
	}

	joined := strings.Join(parts, "\n")
	sum := sha256.Sum256([]byte(joined))
	hash := hex.EncodeToString(sum[:])

	flags := Scan(joined)
	return flags, hash
}
