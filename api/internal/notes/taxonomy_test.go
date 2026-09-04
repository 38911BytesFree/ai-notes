package notes

import "testing"

func TestNormalise(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"Programming", "Programming"},
		{"programming", "Programming"},
		{"PROGRAMMING", "Programming"},
		{"  programming  ", "Programming"},
		{"AI & ML", "AI & ML"},
		{"ai & ml", "AI & ML"},
		{"Finance & Investing", "Finance & Investing"},
		{"finance & investing", "Finance & Investing"},
		{"Business", "Business"},
		{"business", "Business"},
		{"Science", "Science"},
		{"science", "Science"},
		{"Health", "Health"},
		{"health", "Health"},
		{"Law", "Law"},
		{"law", "Law"},
		{"Writing", "Writing"},
		{"writing", "Writing"},
		{"Education", "Education"},
		{"education", "Education"},
		{"Cooking", "Cooking"},
		{"cooking", "Cooking"},
		{"Travel", "Travel"},
		{"travel", "Travel"},
		{"Home", "Home"},
		{"home", "Home"},
		{"Career", "Career"},
		{"career", "Career"},
		{"Productivity", "Productivity"},
		{"productivity", "Productivity"},
		{"Design", "Design"},
		{"design", "Design"},
		{"Marketing", "Marketing"},
		{"marketing", "Marketing"},
		{"Personal", "Personal"},
		{"personal", "Personal"},
		{"Other", "Other"},
		{"other", "Other"},
		{"", "Other"},
		{"   ", "Other"},
		{"Random Category", "Other"},
		{"Cryptocurrency", "Other"},
		{"Gaming", "Other"},
	}

	for _, tc := range tests {
		t.Run(tc.input, func(t *testing.T) {
			got := Normalise(tc.input)
			if got != tc.expected {
				t.Errorf("Normalise(%q) = %q; want %q", tc.input, got, tc.expected)
			}
		})
	}
}
