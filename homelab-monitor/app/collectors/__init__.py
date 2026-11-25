"""Registro dos tipos de integração. Para adicionar um tipo novo, importe a classe aqui."""
from .proxmox import PBS, Proxmox
from .homeassistant import HomeAssistant
from .media import Emby, Jellyfin, Nextcloud
from .services import HttpCheck, TcpCheck, Zabbix
from .truenas import TrueNAS
from .unifi import UniFi

TYPES = {c.type: c for c in (UniFi, Proxmox, PBS, TrueNAS, Zabbix, HomeAssistant, Emby, Jellyfin, Nextcloud, HttpCheck, TcpCheck)}
