const DEVICE_NAME_PREFIX = "ESP32_LOCK";

const SERVICE_UUID = "0000FFF0-0000-1000-8000-00805F9B34FB";
const WRITE_UUID = "0000FFF1-0000-1000-8000-00805F9B34FB";

const PASSWORD = "409202";

Page({
  data: {
    keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
    password: "",
    maskedPassword: "",

    status: "页面已加载，准备初始化蓝牙",

    deviceId: "",
    serviceId: "",
    writeCharId: "",

    connected: false
  },

  onLoad() {
    this.initBluetooth();
  },

  onUnload() {
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
        status: "密码错误"
      });

      return;
    }

    if (!this.data.connected) {
      wx.showToast({
        title: "蓝牙未连接",
        icon: "none"
      });

      this.setData({
        status: "密码正确，但蓝牙未连接"
      });

      return;
    }

    this.sendCommand("OPEN");
  },

  initBluetooth() {
    this.setData({
      status: "正在初始化蓝牙..."
    });

    wx.openBluetoothAdapter({
      mode: "central",

      success: () => {
        console.log("蓝牙初始化成功");

        this.setData({
          status: "蓝牙初始化成功，正在搜索 ESP32..."
        });

        this.listenConnectionState();
        this.listenDeviceFound();
        this.startDiscovery();
      },

      fail: (err) => {
        console.error("蓝牙初始化失败", err);

        this.setData({
          status: "蓝牙初始化失败，请打开手机蓝牙和微信蓝牙权限"
        });

        wx.showModal({
          title: "蓝牙初始化失败",
          content: "请确认手机蓝牙已打开，并且微信有蓝牙/附近设备权限。",
          showCancel: false
        });
      }
    });
  },

  startDiscovery() {
    wx.startBluetoothDevicesDiscovery({
      allowDuplicatesKey: false,
      services: [],

      success: () => {
        console.log("开始搜索蓝牙设备");

        this.setData({
          status: "正在搜索 ESP32_LOCK_001..."
        });
      },

      fail: (err) => {
        console.error("搜索失败", err);

        this.setData({
          status: "搜索蓝牙设备失败"
        });
      }
    });
  },

  listenDeviceFound() {
    wx.onBluetoothDeviceFound((res) => {
      const devices = res.devices || [];

      for (const device of devices) {
        const name = device.name || device.localName || "";

        console.log("发现设备：", name, device.deviceId);

        if (name.startsWith(DEVICE_NAME_PREFIX)) {
          console.log("匹配到目标设备：", name);

          wx.stopBluetoothDevicesDiscovery();

          this.setData({
            status: "找到设备：" + name
          });

          this.connectDevice(device.deviceId);
          break;
        }
      }
    });
  },

  connectDevice(deviceId) {
    this.setData({
      status: "正在连接 ESP32..."
    });

    wx.createBLEConnection({
      deviceId,

      success: () => {
        console.log("BLE 连接成功");

        this.setData({
          deviceId,
          status: "连接成功，正在获取服务..."
        });

        setTimeout(() => {
          this.getDeviceServices(deviceId);
        }, 500);
      },

      fail: (err) => {
        console.error("连接失败", err);

        this.setData({
          status: "连接失败，请靠近 ESP32 后重试"
        });
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
          this.setData({
            status: "未找到目标服务 FFF0"
          });
          return;
        }

        this.setData({
          serviceId: targetService.uuid,
          status: "找到服务，正在获取特征值..."
        });

        this.getDeviceCharacteristics(deviceId, targetService.uuid);
      },

      fail: (err) => {
        console.error("获取服务失败", err);

        this.setData({
          status: "获取服务失败"
        });
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
          this.setData({
            status: "未找到写特征值 FFF1"
          });
          return;
        }

        if (!targetChar.properties.write && !targetChar.properties.writeNoResponse) {
          this.setData({
            status: "目标特征值不支持写入"
          });
          return;
        }

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
        console.error("获取特征值失败", err);

        this.setData({
          status: "获取特征值失败"
        });
      }
    });
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
        console.error("发送失败", err);

        wx.showToast({
          title: "发送失败",
          icon: "error"
        });

        this.setData({
          status: "发送失败"
        });
      }
    });
  },

  listenConnectionState() {
    wx.onBLEConnectionStateChange((res) => {
      console.log("连接状态变化：", res);

      if (!res.connected) {
        this.setData({
          connected: false,
          status: "蓝牙已断开"
        });
      }
    });
  },

  closeBluetooth() {
    if (this.data.deviceId) {
      wx.closeBLEConnection({
        deviceId: this.data.deviceId
      });
    }

    wx.closeBluetoothAdapter();
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