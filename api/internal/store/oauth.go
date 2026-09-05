package store

import (
	"time"
)

type OAuthClient struct {
	ClientID                string    `firestore:"client_id" json:"client_id"`
	ClientSecretHash        string    `firestore:"client_secret_hash,omitempty" json:"client_secret_hash,omitempty"`
	ClientName              string    `firestore:"client_name" json:"client_name"`
	RedirectURIs            []string  `firestore:"redirect_uris" json:"redirect_uris"`
	TokenEndpointAuthMethod string    `firestore:"token_endpoint_auth_method" json:"token_endpoint_auth_method"`
	GrantTypes              []string  `firestore:"grant_types" json:"grant_types"`
	Scope                   string    `firestore:"scope" json:"scope"`
	ClientIDIssuedAt        int64     `firestore:"client_id_issued_at" json:"client_id_issued_at"`
	CreatedAt               time.Time `firestore:"created_at" json:"created_at"`
}

type OAuthCode struct {
	CodeHash            string    `firestore:"-" json:"code_hash,omitempty"`
	ClientID            string    `firestore:"client_id" json:"client_id"`
	UID                 string    `firestore:"uid" json:"uid"`
	Scopes              []string  `firestore:"scopes" json:"scopes"`
	CodeChallenge       string    `firestore:"code_challenge" json:"code_challenge"`
	CodeChallengeMethod string    `firestore:"code_challenge_method" json:"code_challenge_method"`
	RedirectURI         string    `firestore:"redirect_uri" json:"redirect_uri"`
	Resource            string    `firestore:"resource" json:"resource"`
	ExpiresAt           time.Time `firestore:"expires_at" json:"expires_at"`
	Consumed            bool      `firestore:"consumed" json:"consumed"`
}

type OAuthToken struct {
	TokenHash         string    `firestore:"-" json:"token_hash,omitempty"`
	Kind              string    `firestore:"kind" json:"kind"` // "access" | "refresh"
	ClientID          string    `firestore:"client_id" json:"client_id"`
	UID               string    `firestore:"uid" json:"uid"`
	Scopes            []string  `firestore:"scopes" json:"scopes"`
	Resource          string    `firestore:"resource" json:"resource"`
	ExpiresAt         time.Time `firestore:"expires_at" json:"expires_at"`
	CreatedAt         time.Time `firestore:"created_at" json:"created_at"`
	RefreshParentHash string    `firestore:"refresh_parent_hash,omitempty" json:"refresh_parent_hash,omitempty"`
	Revoked           bool      `firestore:"revoked" json:"revoked"`
}

type PATToken struct {
	ID         string     `firestore:"id" json:"id"`
	TokenHash  string     `firestore:"-" json:"-"`
	UID        string     `firestore:"uid" json:"uid"`
	Label      string     `firestore:"label" json:"label"`
	Prefix     string     `firestore:"prefix" json:"prefix"`
	Scopes     []string   `firestore:"scopes" json:"scopes"`
	CreatedAt  time.Time  `firestore:"created_at" json:"created_at"`
	LastUsedAt *time.Time `firestore:"last_used_at,omitempty" json:"last_used_at,omitempty"`
	RevokedAt  *time.Time `firestore:"revoked_at,omitempty" json:"revoked_at,omitempty"`
}
