# تصویر سبک مایگریشن — هم برای docker compose محلی و هم به‌عنوان K8s pre-deploy Job
FROM alpine:3.20

RUN apk add --no-cache postgresql16-client bash coreutils

WORKDIR /repo
# فقط چیزی که برای مایگریشن لازم است کپی می‌شود
COPY db/ /repo/db/
COPY backend/identity-service/prisma/     /repo/backend/identity-service/prisma/
COPY backend/property-service/prisma/     /repo/backend/property-service/prisma/
COPY backend/facility-service/prisma/     /repo/backend/facility-service/prisma/
COPY backend/finance-service/prisma/      /repo/backend/finance-service/prisma/
COPY backend/guard-service/prisma/        /repo/backend/guard-service/prisma/
COPY backend/notification-service/prisma/ /repo/backend/notification-service/prisma/
COPY backend/audit-service/prisma/        /repo/backend/audit-service/prisma/
COPY backend/fnb-service/prisma/          /repo/backend/fnb-service/prisma/

RUN chmod +x /repo/db/migrate.sh
ENTRYPOINT ["/repo/db/migrate.sh"]
