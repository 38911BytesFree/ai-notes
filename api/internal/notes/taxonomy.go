package notes

import "strings"

// Categories is the fixed list of allowable note categories.
var Categories = []string{
	"Programming",
	"AI & ML",
	"Finance & Investing",
	"Business",
	"Science",
	"Health",
	"Law",
	"Writing",
	"Education",
	"Cooking",
	"Travel",
	"Home",
	"Career",
	"Productivity",
	"Design",
	"Marketing",
	"Personal",
	"Other",
}

// Normalise returns the canonical category name matching the input case-insensitively,
// or "Other" if the category is not recognised.
func Normalise(cat string) string {
	cleaned := strings.TrimSpace(cat)
	for _, c := range Categories {
		if strings.EqualFold(cleaned, c) {
			return c
		}
	}
	return "Other"
}
