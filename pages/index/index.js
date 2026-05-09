Page({
  data: {
    keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
    password: "",
    maskedPassword: "",
    status: "页面已加载"
  },

  onKeyTap(e) {
    const key = e.currentTarget.dataset.key;
    const password = this.data.password + key;

    this.setData({
      password: password,
      maskedPassword: "*".repeat(password.length)
    });
  },

  onDelete() {
    const password = this.data.password.slice(0, -1);

    this.setData({
      password: password,
      maskedPassword: "*".repeat(password.length)
    });
  },

  onConfirm() {
    if (this.data.password === "409202") {
      wx.showToast({
        title: "密码正确",
        icon: "success"
      });

      this.setData({
        status: "密码正确，准备发送蓝牙指令"
      });
    } else {
      wx.showToast({
        title: "密码错误",
        icon: "error"
      });

      this.setData({
        password: "",
        maskedPassword: "",
        status: "密码错误"
      });
    }
  }
});