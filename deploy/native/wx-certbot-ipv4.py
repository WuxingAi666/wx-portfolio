#!/opt/wx-certbot/bin/python
"""Certbot 5.x runtime with IPv4 egress for the existing server's renewal job."""
import socket
import sys

original_getaddrinfo = socket.getaddrinfo


def ipv4_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    return original_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)


if __name__ == '__main__':
    socket.getaddrinfo = ipv4_getaddrinfo
    from certbot.main import main
    sys.exit(main())
