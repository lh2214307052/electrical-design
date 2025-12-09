/**
 * types.ts
 * 对应你要求的 models.py
 * 定义了负载、项目设置和计算结果的数据结构
 */

// 负载类型枚举 (仅作为常用选项常量使用)
export enum LoadType {
  MOTOR = '电机',
  HEATER = '加热',
  SERVO = '伺服',
  OTHER = '其他',
}

// 输入模式枚举
export enum InputMode {
  KW = 'KW',
  AMP = 'AMP'
}

// 负载项数据模型
export interface LoadItem {
  id: string;           // 唯一标识符
  name: string;         // 负载名称 (如: 主轴电机)
  
  type: string;         // 类型 (改为string，支持自定义输入)
  
  inputMode: InputMode; // 输入模式：功率KW 或 电流A
  powerKw: number;      // 额定功率 (kW) - KW模式下使用
  ratedAmps: number;    // 额定电流 (A) - AMP模式下使用
  
  useSystemVoltage: boolean; // 是否使用系统电压
  voltage: number;      // 电压 (220 or 380) - 当不使用系统电压时有效
  
  quantity: number;     // 数量
  kx: number;           // 同时系数 (0.1 - 1.0)
  cosPhi: number;       // 功率因数
  uses24V: boolean;     // 是否使用DC24V
  current24V: number;   // DC24V电流 (A)
}

// 负载库模板模型 (去除了id和quantity等项目特定属性)
export interface LibraryItem extends Omit<LoadItem, 'id' | 'quantity'> {
  // 模板必须有ID用于管理
  libId: string;
}

// 项目全局配置模型
export interface ProjectConfig {
  systemVoltage: number;    // 系统电压，通常 380
  marginFactor: number;     // 功率裕量系数，默认 1.2
  cableSafetyFactor: number; // 电缆安全系数，默认 1.25
  defaultCosPhi: number;    // 默认功率因数
}

// 24V 电源选型结果
export interface DC24VResult {
  totalCurrent: number;     // 合计电流
  recommendedCurrent: number; // 推荐电流 (含裕量)
  description: string;      // 选型建议文本
}

// 最终计算结果模型
export interface CalculationResult {
  totalActivePower: number; // 总有功功率 (kW)
  totalApparentPower: number; // 总视在功率 (kVA)
  mainCurrent: number;      // 进线电流 (A)
  mainBreaker: string;      // 推荐主空开
  mainCable: string;        // 推荐主电缆
  dc24v: DC24VResult;       // 24V 结果
}