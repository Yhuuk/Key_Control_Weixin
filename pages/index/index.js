const DEVICE_NAME_PREFIX = "ESP32_LOCK";

const SERVICE_UUID = "0000FFF0-0000-1000-8000-00805F9B34FB";
const WRITE_UUID = "0000FFF1-0000-1000-8000-00805F9B34FB";

const PASSWORD = "409202";

Page({
  data: {
    keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
    password: "",
    maskedPassword: "",

    status: "正在准备蓝牙连接...",

    deviceId: "",
    serviceId: "",
    writeCharId: "",

    connected: false
  },

  onLoad() {
    this._retryTimer = null;
    this._connecting = false;
    this._isDiscovering = false;
    this._bluetoothOpened = false;

    this.bindBluetoothEvents();
    this.startAutoConnect();
  },

  onUnload() {
    this.stopAutoConnect();
    this.closeBluetooth();
  },

  onKeyTap(e) {
    const key = e.currentTarget.dataset.key;

    const password = this.data.password + key;

    this.setData({
      password,
      maskedPassword: "*".repeat(password.length)
    });
  },

  onDelete() {
    const password = this.data.password.slice(0, -1);

    this.setData({
      password,
      maskedPassword: "*".repeat(password.length)
    });
  },

  onConfirm() {
    if (this.data.password !== PASSWORD) {
      wx.showToast({
        title: "密码错误",
        icon: "error"
      });

      this.setData({
        password: "",
        maskedPassword: "",
        status: this.data.connected ? "蓝牙已连接，可以输入密码" : "密码错误，正在等待蓝牙连接..."
      });

      return;
    }

    if (!this.data.connected) {
      wx.showToast({
        title: "蓝牙未连接",
        icon: "none"
      });

      this.setData({
        status: "密码正确，但蓝牙还没连接，正在继续重试..."
      });

      this.tryConnectOnce();
      return;
    }

    this.sendCommand("OPEN");
  },

  /**
   * 开始自动连接流程
   * 每隔 3 秒检查一次：
   * 1. 手机蓝牙是否可用
   * 2. 是否正在扫描 ESP32
   * 3. 是否需要重新连接
   */
  startAutoConnect() {
    this.stopAutoConnect();

    this.tryConnectOnce();

    this._retryTimer = setInterval(() => {
      if (this.data.connected) {
        return;
      }

      if (this._connecting) {
        return;
      }

      this.tryConnectOnce();
    }, 3000);
  },

  stopAutoConnect() {
    if (this._retryTimer) {
      clearInterval(this._retryTimer);
      this._retryTimer = null;
    }
  },

  /**
   * 单次连接尝试
   * 这个函数会被定时调用。
   */
  tryConnectOnce() {
    if (this.data.connected || this._connecting) {
      return;
    }

    this.openBluetoothAndSearch();
  },

  /**
   * 打开微信小程序蓝牙适配器
   * 如果手机蓝牙没开，这里会失败，然后等待下次重试。
   */
  openBluetoothAndSearch() {
    wx.openBluetoothAdapter({
      mode: "central",

      success: () => {
        this._bluetoothOpened = true;

        wx.getBluetoothAdapterState({
          success: (res) => {
            console.log("蓝牙适配器状态：", res);

            if (!res.available) {
              this.setData({
                status: "手机蓝牙未开启，请打开手机蓝牙，打开后会自动连接"
              });
              return;
            }

            this.setData({
              status: "手机蓝牙已开启，正在搜索 ESP32..."
            });

            this.startDiscovery();
          },

          fail: (err) => {
            console.error("获取蓝牙状态失败：", err);

            this.setData({
              status: "正在重新检测手机蓝牙..."
            });
          }
        });
      },

      fail: (err) => {
        console.error("打开蓝牙适配器失败：", err);

        this._bluetoothOpened = false;
        this._isDiscovering = false;

        this.setData({
          connected: false,
          status: "手机蓝牙未开启或微信无蓝牙权限，打开后会自动重试"
        });
      }
    });
  },

  /**
   * 开始搜索 BLE 设备
   * 这里设置 allowDuplicatesKey: true，
   * 这样 ESP32 后面才开机时，也更容易被发现。
   */
  startDiscovery() {
    if (this.data.connected || this._connecting) {
      return;
    }

    wx.getBluetoothAdapterState({
      success: (res) => {
        if (!res.available) {
          this._isDiscovering = false;

          this.setData({
            status: "手机蓝牙未开启，请打开后等待自动连接"
          });

          return;
        }

        if (res.discovering) {
          this._isDiscovering = true;

          this.setData({
            status: "正在持续搜索 ESP32_LOCK_001..."
          });

          return;
        }

        wx.startBluetoothDevicesDiscovery({
          allowDuplicatesKey: true,
          services: [],

          success: () => {
            this._isDiscovering = true;

            console.log("开始搜索蓝牙设备");

            this.setData({
              status: "正在持续搜索 ESP32_LOCK_001..."
            });
          },

          fail: (err) => {
            console.error("搜索蓝牙失败：", err);

            this._isDiscovering = false;

            this.setData({
              status: "搜索失败，正在自动重试..."
            });
          }
        });
      },

      fail: (err) => {
        console.error("获取蓝牙适配器状态失败：", err);

        this._isDiscovering = false;

        this.setData({
          status: "蓝牙状态异常，正在自动重试..."
        });
      }
    });
  },

  /**
   * 绑定蓝牙事件，只在 onLoad 里调用一次
   */
  bindBluetoothEvents() {
    wx.onBluetoothAdapterStateChange((res) => {
      console.log("手机蓝牙状态变化：", res);

      if (!res.available) {
        this._isDiscovering = false;
        this._connecting = false;

        this.setData({
          connected: false,
          deviceId: "",
          serviceId: "",
          writeCharId: "",
          status: "手机蓝牙已关闭，请打开蓝牙，打开后会自动连接"
        });

        return;
      }

      this.setData({
        status: "检测到手机蓝牙已开启，正在自动连接..."
      });

      this.tryConnectOnce();
    });

    wx.onBluetoothDeviceFound((res) => {
      const devices = res.devices || [];

      for (const device of devices) {
        const name = device.name || device.localName || "";

        console.log("发现设备：", name, device.deviceId);

        if (!name) {
          continue;
        }

        if (name.startsWith(DEVICE_NAME_PREFIX)) {
          if (this.data.connected || this._connecting) {
            return;
          }

          console.log("发现目标 ESP32：", name, device.deviceId);

          this._connecting = true;

          this.setData({
            status: "发现设备：" + name + "，正在连接..."
          });

          wx.stopBluetoothDevicesDiscovery({
            complete: () => {
              this._isDiscovering = false;
              this.connectDevice(device.deviceId);
            }
          });

          return;
        }
      }
    });

    wx.onBLEConnectionStateChange((res) => {
      console.log("BLE 连接状态变化：", res);

      if (!res.connected) {
        this._connecting = false;
        this._isDiscovering = false;

        this.setData({
          connected: false,
          deviceId: "",
          serviceId: "",
          writeCharId: "",
          status: "蓝牙已断开，正在重新连接..."
        });

        setTimeout(() => {
          this.tryConnectOnce();
        }, 1000);
      }
    });
  },

  connectDevice(deviceId) {
    wx.createBLEConnection({
      deviceId,

      success: () => {
        console.log("BLE 连接成功");

        this.setData({
          deviceId,
          status: "BLE 已连接，正在获取服务..."
        });

        setTimeout(() => {
          this.getDeviceServices(deviceId);
        }, 500);
      },

      fail: (err) => {
        console.error("BLE 连接失败：", err);

        this._connecting = false;

        this.setData({
          connected: false,
          deviceId: "",
          status: "连接失败，正在继续搜索..."
        });

        setTimeout(() => {
          this.tryConnectOnce();
        }, 1000);
      }
    });
  },

  getDeviceServices(deviceId) {
    wx.getBLEDeviceServices({
      deviceId,

      success: (res) => {
        console.log("服务列表：", res.services);

        const targetService = res.services.find((service) => {
          return this.normalizeUUID(service.uuid) === this.normalizeUUID(SERVICE_UUID);
        });

        if (!targetService) {
          this.closeCurrentConnectionAndRetry("未找到目标服务 FFF0，正在重试...");
          return;
        }

        this.setData({
          serviceId: targetService.uuid,
          status: "找到服务，正在获取特征值..."
        });

        this.getDeviceCharacteristics(deviceId, targetService.uuid);
      },

      fail: (err) => {
        console.error("获取服务失败：", err);
        this.closeCurrentConnectionAndRetry("获取服务失败，正在重试...");
      }
    });
  },

  getDeviceCharacteristics(deviceId, serviceId) {
    wx.getBLEDeviceCharacteristics({
      deviceId,
      serviceId,

      success: (res) => {
        console.log("特征值列表：", res.characteristics);

        const targetChar = res.characteristics.find((ch) => {
          return this.normalizeUUID(ch.uuid) === this.normalizeUUID(WRITE_UUID);
        });

        if (!targetChar) {
          this.closeCurrentConnectionAndRetry("未找到写特征值 FFF1，正在重试...");
          return;
        }

        if (!targetChar.properties.write && !targetChar.properties.writeNoResponse) {
          this.closeCurrentConnectionAndRetry("目标特征值不支持写入，正在重试...");
          return;
        }

        this._connecting = false;

        this.setData({
          writeCharId: targetChar.uuid,
          connected: true,
          status: "蓝牙已连接，可以输入密码"
        });

        wx.showToast({
          title: "蓝牙已连接",
          icon: "success"
        });
      },

      fail: (err) => {
        console.error("获取特征值失败：", err);
        this.closeCurrentConnectionAndRetry("获取特征值失败，正在重试...");
      }
    });
  },

  closeCurrentConnectionAndRetry(msg) {
    console.warn(msg);

    const deviceId = this.data.deviceId;

    this._connecting = false;
    this._isDiscovering = false;

    this.setData({
      connected: false,
      serviceId: "",
      writeCharId: "",
      status: msg
    });

    if (deviceId) {
      wx.closeBLEConnection({
        deviceId,
        complete: () => {
          setTimeout(() => {
            this.tryConnectOnce();
          }, 1000);
        }
      });
    } else {
      setTimeout(() => {
        this.tryConnectOnce();
      }, 1000);
    }
  },

  sendCommand(cmd) {
    const buffer = this.stringToArrayBuffer(cmd);

    this.setData({
      status: "正在发送指令：" + cmd
    });

    wx.writeBLECharacteristicValue({
      deviceId: this.data.deviceId,
      serviceId: this.data.serviceId,
      characteristicId: this.data.writeCharId,
      value: buffer,

      success: () => {
        console.log("发送成功：", cmd);

        wx.showToast({
          title: "已发送",
          icon: "success"
        });

        this.setData({
          status: "已发送 OPEN，GPIO2 应该亮 1 秒",
          password: "",
          maskedPassword: ""
        });
      },

      fail: (err) => {
        console.error("发送失败：", err);

        wx.showToast({
          title: "发送失败",
          icon: "error"
        });

        this.setData({
          connected: false,
          status: "发送失败，正在重新连接..."
        });

        this.closeCurrentConnectionAndRetry("发送失败，正在重新连接...");
      }
    });
  },

  closeBluetooth() {
    if (this.data.deviceId) {
      wx.closeBLEConnection({
        deviceId: this.data.deviceId
      });
    }

    wx.stopBluetoothDevicesDiscovery({
      complete: () => {
        this._isDiscovering = false;
      }
    });

    wx.closeBluetoothAdapter({
      complete: () => {
        this._bluetoothOpened = false;
      }
    });
  },

  stringToArrayBuffer(str) {
    const buffer = new ArrayBuffer(str.length);
    const dataView = new Uint8Array(buffer);

    for (let i = 0; i < str.length; i++) {
      dataView[i] = str.charCodeAt(i);
    }

    return buffer;
  },

  normalizeUUID(uuid) {
    return uuid.replace(/-/g, "").toUpperCase();
  }
});