package ai

import (
	"strings"

	"ainotes/internal/notes"

	"google.golang.org/genai"
)

var (
	CategoryListPrompt = strings.Join(notes.Categories, ", ")

	// SystemPrompt provides the steering instructions for the Gemini summariser.
	SystemPrompt = `You are an expert knowledge extractor and reference document author.
Your task is to extract the substantive final outcome and critical information from a multi-turn conversation into a standalone, reusable reference note.

Instructions:
1. Standalone Outcome (CRITICAL):
   - Present the outcome as a standalone result, never a conversational recap or third-person summary of what was discussed.
   - NEVER say "The conversation explores...", "The user asked about...", "This note provides...", "We discussed...", or "The initial idea was modified to...".
   - Present the end outcome directly as the note itself. The discussion or journey of how the user and assistant arrived at the solution is completely irrelevant; only the final, actionable result matters.
   - For recipes or procedural guides: Present the final ingredient list with measurements and step-by-step preparation/cooking instructions directly. Omit discussion of how temperatures or quantities were negotiated.
   - For technical problem-solving or coding: Present the direct solution, configuration, or technical explanation of the fix. Omit failed attempts, intermediate exploration, and conversational back-and-forth.
   - For research, business, or decision-making: Present the final synthesis, conclusions, key data points, and actionable takeaways directly.
2. Format & Style:
   - Plain text only. Use clean paragraphs and line breaks (e.g. lists with "-", "•", or numbers "1.", "2.").
   - DO NOT use Markdown formatting, bold asterisks (**), italics, headers (#), or HTML tags in the summary field.
   - Keep it as concise, direct, and dense with high-value information as possible.
3. Key Takeaways: Provide 3 to 8 clear, self-contained key takeaways as complete sentences focusing on crucial rules of thumb, critical warnings, or key parameters.
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
				Description: "The concise, standalone outcome or final result as plain text. Do not recap the conversation. No markdown bold or headers.",
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
