FROM nginx:alpine
COPY index.html /usr/share/nginx/html/index.html
COPY nginx.conf.template /etc/nginx/nginx.conf.template
CMD ["/bin/sh","-c","sed \"s/__PORT__/${PORT:-8080}/g\" /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf && exec nginx -g 'daemon off;'"]
