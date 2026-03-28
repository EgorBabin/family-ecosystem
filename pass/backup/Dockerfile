FROM alpine:3.20

RUN apk add --no-cache sqlite tzdata

COPY backup/backup.sh /usr/local/bin/backup.sh
COPY backup/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
