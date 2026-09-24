package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"ainotes/internal/notes"

	"google.golang.org/genai"
)

type VertexConfig struct {
	Project  string
	Location string
	Model    string
}

type VertexAI struct {
	client     *genai.Client
	model      string
	embedModel string
}

func NewVertexAI(ctx context.Context, cfg VertexConfig) (*VertexAI, error) {
	location := cfg.Location
	if location == "" {
		location = "europe-west1"
	}
	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		Backend:  genai.BackendVertexAI,
		Project:  cfg.Project,
		Location: location,
	})
	if err != nil {
		return nil, err
	}

	model := cfg.Model
	if model == "" {
		model = "gemini-2.5-flash"
	}

	return &VertexAI{
		client:     client,
		model:      model,
		embedModel: "gemini-embedding-001",
	}, nil
}

func (v *VertexAI) Summarise(ctx context.Context, transcript notes.Transcript) (Summary, error) {
	var convText strings.Builder
	for _, m := range transcript.Messages {
		convText.WriteString(fmt.Sprintf("%s: %s\n\n", strings.ToUpper(m.Role), m.Content))
	}

	prompt := fmt.Sprintf("Extract the final outcome and critical information from this conversation into a standalone, reusable note in the required structured JSON format:\n\n%s", convText.String())
	contents := []*genai.Content{
		genai.NewContentFromText(prompt, "user"),
	}

	return v.generateSummary(ctx, contents)
}

func (v *VertexAI) Refine(ctx context.Context, note *notes.Note, instruction string, transcript *notes.Transcript) (Summary, error) {
	var sb strings.Builder
	sb.WriteString("Refine and update this reference note according to the following instruction:\n\n")
	sb.WriteString(fmt.Sprintf("USER INSTRUCTION:\n%s\n\n", strings.TrimSpace(instruction)))
	sb.WriteString("CURRENT NOTE:\n")
	sb.WriteString(fmt.Sprintf("Title: %s\n", note.Title))
	sb.WriteString(fmt.Sprintf("Category: %s\n", note.Category))
	if len(note.Tags) > 0 {
		sb.WriteString(fmt.Sprintf("Tags: %s\n", strings.Join(note.Tags, ", ")))
	}
	sb.WriteString(fmt.Sprintf("Summary:\n%s\n\n", note.Summary))
	if len(note.Takeaways) > 0 {
		sb.WriteString("Takeaways:\n")
		for _, t := range note.Takeaways {
			sb.WriteString(fmt.Sprintf("- %s\n", t))
		}
		sb.WriteString("\n")
	}
	if len(note.CodeBlocks) > 0 {
		sb.WriteString("Code Blocks:\n")
		for _, cb := range note.CodeBlocks {
			sb.WriteString(fmt.Sprintf("```%s\n%s\n```\n\n", cb.Lang, cb.Code))
		}
	}

	if transcript != nil && len(transcript.Messages) > 0 {
		sb.WriteString("ORIGINAL CONVERSATION TRANSCRIPT (for context if needed):\n")
		for _, m := range transcript.Messages {
			sb.WriteString(fmt.Sprintf("%s: %s\n\n", strings.ToUpper(m.Role), m.Content))
		}
	}

	contents := []*genai.Content{
		genai.NewContentFromText(sb.String(), "user"),
	}

	return v.generateSummary(ctx, contents)
}

func (v *VertexAI) Integrate(ctx context.Context, note *notes.Note, newTranscript notes.Transcript) (Summary, error) {
	var sb strings.Builder
	sb.WriteString("Integrate the new conversation transcript into this existing reference note. Update and merge the substantive outcome, key takeaways, code blocks, and tags so that the resulting note is a comprehensive, standalone reference incorporating both the original note and the new information:\n\n")
	sb.WriteString("CURRENT NOTE:\n")
	sb.WriteString(fmt.Sprintf("Title: %s\n", note.Title))
	sb.WriteString(fmt.Sprintf("Category: %s\n", note.Category))
	if len(note.Tags) > 0 {
		sb.WriteString(fmt.Sprintf("Tags: %s\n", strings.Join(note.Tags, ", ")))
	}
	sb.WriteString(fmt.Sprintf("Summary:\n%s\n\n", note.Summary))
	if len(note.Takeaways) > 0 {
		sb.WriteString("Takeaways:\n")
		for _, t := range note.Takeaways {
			sb.WriteString(fmt.Sprintf("- %s\n", t))
		}
		sb.WriteString("\n")
	}
	if len(note.CodeBlocks) > 0 {
		sb.WriteString("Code Blocks:\n")
		for _, cb := range note.CodeBlocks {
			sb.WriteString(fmt.Sprintf("```%s\n%s\n```\n\n", cb.Lang, cb.Code))
		}
	}

	sb.WriteString("NEW CONVERSATION TRANSCRIPT TO INTEGRATE:\n")
	for _, m := range newTranscript.Messages {
		sb.WriteString(fmt.Sprintf("%s: %s\n\n", strings.ToUpper(m.Role), m.Content))
	}

	contents := []*genai.Content{
		genai.NewContentFromText(sb.String(), "user"),
	}

	return v.generateSummary(ctx, contents)
}


func (v *VertexAI) generateSummary(ctx context.Context, contents []*genai.Content) (Summary, error) {
	temp := float32(0.2)
	cfg := &genai.GenerateContentConfig{
		SystemInstruction: genai.NewContentFromText(SystemPrompt, "system"),
		Temperature:       &temp,
		ResponseMIMEType:  "application/json",
		ResponseSchema:    SummarySchema(),
	}

	// Two attempts on a schema validation failure
	var lastErr error
	for attempt := 1; attempt <= 2; attempt++ {
		resp, err := v.client.Models.GenerateContent(ctx, v.model, contents, cfg)
		if err != nil {
			lastErr = err
			continue
		}

		rawJSON := strings.TrimSpace(resp.Text())
		if rawJSON == "" {
			lastErr = fmt.Errorf("empty response text from model")
			continue
		}

		var summary Summary
		if err := json.Unmarshal([]byte(rawJSON), &summary); err != nil {
			lastErr = err
			continue
		}

		if strings.TrimSpace(summary.Title) == "" {
			lastErr = fmt.Errorf("model returned empty title")
			continue
		}

		// Normalise category
		summary.Category = notes.Normalise(summary.Category)

		return summary, nil
	}

	return Summary{}, fmt.Errorf("%w: %v", ErrSummariseFailed, lastErr)
}

func (v *VertexAI) Embed(ctx context.Context, text string, task EmbedTask) ([]float32, error) {
	contents := []*genai.Content{
		genai.NewContentFromText(text, "user"),
	}
	dim := int32(768)
	cfg := &genai.EmbedContentConfig{
		TaskType:             string(task),
		OutputDimensionality: &dim,
	}

	resp, err := v.client.Models.EmbedContent(ctx, v.embedModel, contents, cfg)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrEmbedFailed, err)
	}
	if len(resp.Embeddings) == 0 || len(resp.Embeddings[0].Values) == 0 {
		return nil, fmt.Errorf("%w: empty embedding values in response", ErrEmbedFailed)
	}

	return resp.Embeddings[0].Values, nil
}
