FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    coreutils \
    curl \
    findutils \
    gzip \
    postgresql-client \
    python3 \
    python3-pip \
  && pip3 install --no-cache-dir gsutil \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENTRYPOINT ["/bin/bash"]
