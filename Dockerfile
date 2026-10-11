# syntax=docker/dockerfile:1
ARG RUST_VERSION=1.97.1
FROM rust:${RUST_VERSION}-bookworm AS build
WORKDIR /src
RUN rustup target add wasm32-unknown-unknown
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    cargo install wasm-bindgen-cli --version 0.2.114 --locked --root /tools
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY prototypes ./prototypes
COPY scripts/build-web.sh ./scripts/build-web.sh
RUN mkdir -p .tools/bin && ln -s /tools/bin/wasm-bindgen .tools/bin/wasm-bindgen
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/src/target \
    ./scripts/build-web.sh && \
    cargo build --locked --release -p server && \
    cp target/release/server /src/drawing-board

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --create-home app \
    && mkdir -p /app/data && chown app:app /app/data
WORKDIR /app
COPY --from=build /src/drawing-board /usr/local/bin/drawing-board
COPY --from=build /src/dist ./dist
USER app
ENV PORT=3000 DATABASE_PATH=/app/data/drawing-board.sqlite RUST_LOG=info
EXPOSE 3000
CMD ["drawing-board"]
