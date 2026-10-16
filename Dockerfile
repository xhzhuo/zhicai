FROM public.ecr.aws/docker/library/python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    HOME=/tmp \
    ZHICAI_DEPLOYMENT=server

WORKDIR /opt/zhicai

ARG DEBIAN_MIRROR=http://deb.debian.org/debian
ARG DEBIAN_SECURITY_MIRROR=http://deb.debian.org/debian-security
ARG PIP_INDEX_URL=https://pypi.org/simple
RUN sed -i \
      -e "s|^URIs: http://deb.debian.org/debian$|URIs: ${DEBIAN_MIRROR}|" \
      -e "s|^URIs: http://deb.debian.org/debian-security$|URIs: ${DEBIAN_SECURITY_MIRROR}|" \
      /etc/apt/sources.list.d/debian.sources
COPY app/requirements.txt /tmp/zhicai-requirements.txt
RUN python -m pip install --no-cache-dir --timeout 120 --index-url "$PIP_INDEX_URL" -r /tmp/zhicai-requirements.txt \
    && python -m playwright install --with-deps chromium \
    && chmod -R a+rX /ms-playwright

ENV HOME=/home/zhicai
RUN groupadd --gid 1000 zhicai && useradd --uid 1000 --gid 1000 --create-home --shell /usr/sbin/nologin zhicai
COPY --chown=1000:1000 app/ ./app/
COPY --chown=1000:1000 demo/ ./demo/
RUN mkdir -p /opt/zhicai/app/data && chown -R 1000:1000 /opt/zhicai/app/data

USER zhicai:zhicai
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8765", "--no-proxy-headers"]

