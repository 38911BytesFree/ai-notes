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

	prompt := fmt.Sprintf("Summarise the following conversation into the required structured JSON format:\n\n%s", convText.String())
	contents := []*genai.Content{
		genai.NewContentFromText(prompt, "user"),
	}

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
