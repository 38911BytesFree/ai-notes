# Stage 1: Build binary
FROM golang:1.25 AS build

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /app/api ./cmd/api

# Stage 2: Distroless runtime
FROM gcr.io/distroless/base-debian12

WORKDIR /app

COPY --from=build /app/api /app/api

EXPOSE 8000

CMD ["/app/api"]
