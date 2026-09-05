package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"ainotes/internal/ai"
	"ainotes/internal/ingest"
	"ainotes/internal/store"
)

type ErrorCode string

const (
	ErrCodeUnauthenticated     ErrorCode = "unauthenticated"      // 401
	ErrCodeNotFound            ErrorCode = "not_found"            // 404
	ErrCodeInvalidArgument     ErrorCode = "invalid_argument"     // 400
	ErrCodeUnsupportedProvider ErrorCode = "unsupported_provider"  // 400
	ErrCodeFetchFailed         ErrorCode = "fetch_failed"         // 502
	ErrCodeFetchBlocked        ErrorCode = "fetch_blocked"        // 502
	ErrCodeTranscriptEmpty     ErrorCode = "transcript_empty"     // 400
	ErrCodeTranscriptTooLong   ErrorCode = "transcript_too_long"  // 400
	ErrCodeSummariseFailed     ErrorCode = "summarise_failed"     // 502
	ErrCodeIngestLimitReached  ErrorCode = "ingest_limit_reached" // 429
	ErrCodeForbidden           ErrorCode = "forbidden"            // 403
	ErrCodeRateLimited         ErrorCode = "rate_limited"         // 429
	ErrCodeInternalError       ErrorCode = "internal_error"       // 500
)

// writeError writes the strictly closed JSON error response {"code":"<code>"}.
func writeError(w http.ResponseWriter, code ErrorCode) {
	status := http.StatusInternalServerError
	switch code {
	case ErrCodeUnauthenticated:
		status = http.StatusUnauthorized
	case ErrCodeForbidden:
		status = http.StatusForbidden
	case ErrCodeNotFound:
		status = http.StatusNotFound
	case ErrCodeInvalidArgument, ErrCodeUnsupportedProvider, ErrCodeTranscriptEmpty, ErrCodeTranscriptTooLong:
		status = http.StatusBadRequest
	case ErrCodeFetchFailed, ErrCodeFetchBlocked, ErrCodeSummariseFailed:
		status = http.StatusBadGateway
	case ErrCodeIngestLimitReached, ErrCodeRateLimited:
		status = http.StatusTooManyRequests
	case ErrCodeInternalError:
		status = http.StatusInternalServerError
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"code": string(code)})
}

// mapIngestError converts internal domain errors to public ErrorCodes.
func mapIngestError(err error) ErrorCode {
	switch {
	case errors.Is(err, ingest.ErrUnsupportedProvider):
		return ErrCodeUnsupportedProvider
	case errors.Is(err, ingest.ErrFetchFailed):
		return ErrCodeFetchFailed
	case errors.Is(err, ingest.ErrFetchBlocked):
		return ErrCodeFetchBlocked
	case errors.Is(err, ingest.ErrTranscriptEmpty):
		return ErrCodeTranscriptEmpty
	case errors.Is(err, ingest.ErrTranscriptTooLong):
		return ErrCodeTranscriptTooLong
	case errors.Is(err, ai.ErrSummariseFailed):
		return ErrCodeSummariseFailed
	case errors.Is(err, store.ErrIngestLimitReached):
		return ErrCodeIngestLimitReached
	case errors.Is(err, store.ErrNotFound):
		return ErrCodeNotFound
	default:
		return ErrCodeInternalError
	}
}
