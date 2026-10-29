#!/usr/bin/python3
"""Use IPv4 for this Certbot process on hosts with unreliable IPv6 egress.

Installed by the operator; leaves system DNS, firewall and other apps unchanged.
Requires the Ubuntu python3-certbot package, not the application's virtualenv.
"""
import socket
import sys

original_getaddrinfo = socket.getaddrinfo


def ipv4_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    return original_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)


if __name__ == '__main__':
    socket.getaddrinfo = ipv4_getaddrinfo
    from certbot.main import main
    sys.exit(main())
