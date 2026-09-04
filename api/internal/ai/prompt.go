package ai

import (
	"strings"

	"ainotes/internal/notes"

	"google.golang.org/genai"
)

var (
	CategoryListPrompt = strings.Join(notes.Categories, ", ")

	// SystemPrompt provides the steering instructions for the Gemini summariser.
	SystemPrompt = `You are an expert technical note-taker and knowledge organiser.
Your task is to summarise a multi-turn conversation between a user and an AI assistant into a structured, reusable note.

Instructions:
1. Audience: Summarise for someone who wants to reuse the knowledge later, not for someone who wants a recap of the chat. Focus on decisions made, solutions found, technical explanations, and actionable patterns.
2. Format: Plain text only. Use clean paragraphs separated by double newlines. DO NOT use Markdown formatting, bold asterisks (**), italics, headers (#), or HTML tags in the summary field.
3. Key Takeaways: Provide 3 to 8 clear, self-contained key takeaways as complete sentences.
4. Code Blocks: Extract every meaningful code block, script, or configuration snippet verbatim. Assign the exact language tag (e.g., "python", "go", "typescript", "bash", "json", "sql").
5. Category: Choose EXACTLY ONE category from this allowed list:
` + CategoryListPrompt + `
If none clearly fits, choose "Other".
6. Tags: Provide up to 10 lowercase, hyphenated or single-word tags describing the core topics.
7. Privacy: Do not include personal names, email addresses, phone numbers, or private credentials in the title or summary.
`
)

// SummarySchema returns the OpenAPI 3.0 schema matching the Summary struct.
func SummarySchema() *genai.Schema {
	return &genai.Schema{
		Type: genai.TypeObject,
		Properties: map[string]*genai.Schema{
			"title": {
				Type:        genai.TypeString,
				Description: "A concise, informative title capturing the subject matter (max 200 characters).",
			},
			"summary": {
				Type:        genai.TypeString,
				Description: "Plain text summary paragraphs separated by double newlines. Never use Markdown or HTML tags.",
			},
			"takeaways": {
				Type:        genai.TypeArray,
				Description: "3 to 8 key takeaways as complete, standalone sentences.",
				Items: &genai.Schema{
					Type: genai.TypeString,
				},
			},
			"code_blocks": {
				Type:        genai.TypeArray,
				Description: "Code blocks and configuration snippets extracted verbatim.",
				Items: &genai.Schema{
					Type: genai.TypeObject,
					Properties: map[string]*genai.Schema{
						"lang": {
							Type:        genai.TypeString,
							Description: "Language identifier in lowercase (e.g., 'go', 'python', 'bash', 'json').",
						},
						"code": {
							Type:        genai.TypeString,
							Description: "The exact code content.",
						},
					},
					Required: []string{"lang", "code"},
				},
			},
			"category": {
				Type:        genai.TypeString,
				Description: "Exactly one category from the allowed taxonomy.",
				Enum:        notes.Categories,
			},
			"tags": {
				Type:        genai.TypeArray,
				Description: "Up to 10 lowercase tags for searching and filtering.",
				Items: &genai.Schema{
					Type: genai.TypeString,
				},
			},
		},
		Required: []string{"title", "summary", "takeaways", "code_blocks", "category", "tags"},
	}
}
