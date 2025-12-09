/**
 * data/tables.ts
 * 对应你要求的 repositories.py 和 JSON 数据源
 * 存储电缆载流量表、PE线匹配表等静态数据
 */

import { InputMode, LoadType, LibraryItem } from "../types";

// 简化的电缆载流量表 (基于 PVC 绝缘铜线，管内敷设保守值)
// [截面积(mm²), 允许电流(A)]
export const CABLE_TABLE: [number, number][] = [
  [1.5, 14],
  [2.5, 20],
  [4, 28],
  [6, 36],
  [10, 50],
  [16, 68],
  [25, 89],
  [35, 110],
  [50, 134],
  [70, 171],
  [95, 207],
  [120, 239],
  [150, 276],
  [185, 311],
  [240, 363]
];

// 常见断路器/空开规格 (A)
export const BREAKER_SIZES = [
  6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 630
];

// 电机接触器推荐表 (近似值，AC-3使用类别)
// [电机功率kW, 推荐接触器电流规格]
export const CONTACTOR_TABLE: [number, string][] = [
  [4, '09A'],
  [5.5, '12A'],
  [7.5, '18A'],
  [11, '25A'],
  [15, '32A'],
  [18.5, '40A'],
  [22, '50A'],
  [30, '65A'],
  [37, '80A'],
  [45, '95A'],
];

// 预设负载库
export const DEFAULT_LIBRARY: LibraryItem[] = [
  {
    libId: 'default-01',
    name: '0.75kW 电机',
    type: LoadType.MOTOR,
    inputMode: InputMode.KW,
    powerKw: 0.75,
    ratedAmps: 0,
    useSystemVoltage: true,
    voltage: 380,
    kx: 1.0,
    cosPhi: 0.8,
    uses24V: false,
    current24V: 0
  },
  {
    libId: 'default-02',
    name: '5.5kW 电机',
    type: LoadType.MOTOR,
    inputMode: InputMode.KW,
    powerKw: 5.5,
    ratedAmps: 0,
    useSystemVoltage: true,
    voltage: 380,
    kx: 1.0,
    cosPhi: 0.82,
    uses24V: false,
    current24V: 0
  },
  {
    libId: 'default-03',
    name: '15kW 大功率电机',
    type: LoadType.MOTOR,
    inputMode: InputMode.KW,
    powerKw: 15,
    ratedAmps: 0,
    useSystemVoltage: true,
    voltage: 380,
    kx: 1.0,
    cosPhi: 0.85,
    uses24V: false,
    current24V: 0
  },
  {
    libId: 'default-04',
    name: '伺服驱动器 (1kW)',
    type: LoadType.SERVO,
    inputMode: InputMode.KW,
    powerKw: 1.0,
    ratedAmps: 0,
    useSystemVoltage: true,
    voltage: 380,
    kx: 0.6,
    cosPhi: 0.9,
    uses24V: true,
    current24V: 1.0
  },
  {
    libId: 'default-05',
    name: '变频器 (7.5kW)',
    type: LoadType.OTHER,
    inputMode: InputMode.KW,
    powerKw: 7.5,
    ratedAmps: 0,
    useSystemVoltage: true,
    voltage: 380,
    kx: 0.9,
    cosPhi: 0.95,
    uses24V: true,
    current24V: 0.5
  },
  {
    libId: 'default-06',
    name: '加热管 (2kW 220V)',
    type: LoadType.HEATER,
    inputMode: InputMode.KW,
    powerKw: 2.0,
    ratedAmps: 0,
    useSystemVoltage: false,
    voltage: 220,
    kx: 0.8,
    cosPhi: 1.0,
    uses24V: false,
    current24V: 0
  },
  {
    libId: 'default-07',
    name: '电磁阀/控制电源',
    type: LoadType.OTHER,
    inputMode: InputMode.KW,
    powerKw: 0.1,
    ratedAmps: 0,
    useSystemVoltage: false,
    voltage: 220,
    kx: 1.0,
    cosPhi: 0.9,
    uses24V: true,
    current24V: 5.0
  }
];

// 示例初始数据
export const EXAMPLE_LOADS = [
  {
    id: '1',
    name: '液压泵电机',
    type: '电机',
    inputMode: InputMode.KW,
    powerKw: 5.5,
    ratedAmps: 0,
    useSystemVoltage: true,
    voltage: 380,
    quantity: 1,
    kx: 1.0,
    cosPhi: 0.8,
    uses24V: false,
    current24V: 0
  },
  {
    id: '2',
    name: '加热管组A',
    type: '加热',
    inputMode: InputMode.KW,
    powerKw: 2.0,
    ratedAmps: 0,
    useSystemVoltage: false,
    voltage: 220,
    quantity: 6,
    kx: 0.8,
    cosPhi: 1.0,
    uses24V: false,
    current24V: 0
  },
  {
    id: '3',
    name: '未知功率设备',
    type: '其他',
    inputMode: InputMode.AMP,
    powerKw: 0,
    ratedAmps: 10,
    useSystemVoltage: false,
    voltage: 220,
    quantity: 1,
    kx: 1.0,
    cosPhi: 0.9,
    uses24V: false,
    current24V: 0
  },
  {
    id: '4',
    name: '伺服驱动',
    type: '伺服',
    inputMode: InputMode.KW,
    powerKw: 1.5,
    ratedAmps: 0,
    useSystemVoltage: true,
    voltage: 380, // Default usually follows system
    quantity: 2,
    kx: 0.6,
    cosPhi: 0.9,
    uses24V: true,
    current24V: 1.5
  },
  {
    id: '5',
    name: '控制系统及HMI',
    type: '其他',
    inputMode: InputMode.KW,
    powerKw: 0.2,
    ratedAmps: 0,
    useSystemVoltage: false,
    voltage: 220,
    quantity: 1,
    kx: 1.0,
    cosPhi: 0.9,
    uses24V: true,
    current24V: 2.0
  }
];