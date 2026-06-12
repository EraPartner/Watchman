import type { HttpClient } from "../infra/http/client.js";
import type { PingProber } from "../infra/net/pingProbe.js";
import type { TcpProber } from "../infra/net/tcpProbe.js";
import type { SshExecutor } from "../infra/ssh/sshExecutor.js";
import type { SnmpGetter } from "../infra/snmp/snmpGetter.js";
import type { PigpioClient } from "../infra/gpio/pigpioClient.js";
import type { TorControlClient } from "../infra/tor/controlClient.js";
import type { RoonConnectFn } from "../infra/roon/roonClient.js";
import type { ZmqConnectFn } from "../infra/zmq/zmqSubscriber.js";
import type { ServiceInstance, ServicesConfig } from "../config/services.js";
import type { BaseService } from "../domain/BaseService.js";
import { ServiceRegistry } from "../domain/ServiceRegistry.js";
import { AdGuardService } from "../domain/services/adguard/AdGuardService.js";
import { AlbyHubService } from "../domain/services/albyHub/AlbyHubService.js";
import { BitcoinService } from "../domain/services/bitcoin/BitcoinService.js";
import { HomebridgeService } from "../domain/services/homebridge/HomebridgeService.js";
import { createHomebridgeClient } from "../domain/services/homebridge/homebridgeClient.js";
import { IpfsService } from "../domain/services/ipfs/IpfsService.js";
import { MacMiniService } from "../domain/services/macMini/MacMiniService.js";
import { PhilipsBridgeService } from "../domain/services/philipsBridge/PhilipsBridgeService.js";
import { QBittorrentService } from "../domain/services/qbittorrent/QBittorrentService.js";
import { RaspberryPiService } from "../domain/services/raspberryPi/RaspberryPiService.js";
import { RoonService } from "../domain/services/roon/RoonService.js";
import { RouterService } from "../domain/services/router/RouterService.js";
import { SynologyService } from "../domain/services/synology/SynologyService.js";
import { createDsmClient } from "../infra/synology/dsmClient.js";
import { TorService } from "../domain/services/tor/TorService.js";
import { createTorEventSubscriptionFactory } from "../infra/tor/eventSubscription.js";

export interface ServiceInfra {
  http: HttpClient;
  ping: PingProber;
  tcp: TcpProber;
  ssh: SshExecutor;
  snmp: SnmpGetter;
  pigpio: PigpioClient;
  torControl: TorControlClient;
  roonConnect?: RoonConnectFn;
  zmqConnect?: ZmqConnectFn;
  now: () => number;
}

export function createService(
  instance: ServiceInstance,
  infra: ServiceInfra
): BaseService {
  return buildService(instance, infra);
}

function buildService(
  instance: ServiceInstance,
  infra: ServiceInfra
): BaseService {
  const { http, ping, tcp, ssh, snmp, pigpio, torControl, roonConnect, zmqConnect, now } =
    infra;
  switch (instance.kind) {
    case "ipfs":
      return new IpfsService({ http, ping, config: instance, now });
    case "router":
      return new RouterService({ ping, tcp, snmp, config: instance, now });
    case "philipsBridge":
      return new PhilipsBridgeService({ ping, http, config: instance, now });
    case "roon":
      return new RoonService({
        ping,
        tcp,
        config: instance,
        now,
        ...(roonConnect ? { roonConnect } : {}),
      });
    case "qbittorrent":
      return new QBittorrentService({ http, ping, config: instance, now });
    case "adguard":
      return new AdGuardService({ http, ping, config: instance, now });
    case "albyHub":
      return new AlbyHubService({ http, ping, config: instance, now });
    case "tor":
      return new TorService({
        http,
        ping,
        torControl,
        eventSubscriptionFactory: createTorEventSubscriptionFactory(),
        config: instance,
        now,
      });
    case "bitcoin":
      return new BitcoinService({ http, ping, config: instance, now, ...(zmqConnect ? { zmqConnect } : {}) });
    case "macMini":
      return new MacMiniService({ ping, ssh, config: instance, now });
    case "synology": {
      const dsmClient =
        instance.dsmUrl && instance.dsmAccount && instance.dsmPassword
          ? createDsmClient({
              http,
              config: {
                baseUrl: instance.dsmUrl,
                account: instance.dsmAccount,
                password: instance.dsmPassword,
                timeoutMs: instance.timeoutMs,
              },
            })
          : undefined;
      return new SynologyService({
        snmp,
        ping,
        config: instance,
        now,
        ...(dsmClient ? { dsm: dsmClient } : {}),
      });
    }
    case "homebridge": {
      const client = createHomebridgeClient({
        http,
        config: {
          baseUrl: instance.baseUrl,
          username: instance.username,
          password: instance.password,
          authToken: instance.authToken,
          loginPath: instance.loginPath,
          timeoutMs: instance.timeoutMs,
        },
      });
      return new HomebridgeService({ client, ping, config: instance, now });
    }
    case "raspberryPi":
      return new RaspberryPiService({
        pigpio,
        ping,
        ssh,
        config: instance,
        now,
      });
  }
}

export function registerServices(
  config: ServicesConfig,
  infra: ServiceInfra
): ServiceRegistry {
  const registry = new ServiceRegistry();
  for (const instance of config.instances) {
    if (!instance.enabled) continue;
    registry.register(buildService(instance, infra));
  }
  return registry;
}
