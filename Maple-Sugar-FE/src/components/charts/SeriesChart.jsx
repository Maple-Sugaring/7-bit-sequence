import dayjs from 'dayjs';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ritOrange, accent } from '../../theme/ritColors';

function dateTick(value) {
  return dayjs(value).format('MMM D');
}

function tipLabel(value) {
  return dayjs(value).format('ddd, MMM D');
}

/**
 * Day-by-day charts. `rows` use the weather API shape:
 * `{ Date, Temp_Min_F, Temp_Max_F, Flow_Gal, Sugar_Percent, Sap_Run }`.
 */

export function DailyTemperatureChart({ rows }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#D0D3D4" vertical={false} />
        <XAxis dataKey="Date" tickFormatter={dateTick} minTickGap={28} tick={{ fontSize: 12 }} />
        <YAxis width={48} unit="°" tick={{ fontSize: 12 }} />
        <Tooltip labelFormatter={tipLabel} />
        <Legend />
        <Line type="monotone" dataKey="Temp_Max_F" name="High °F" stroke={ritOrange} dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="Temp_Min_F" name="Low °F" stroke={accent.blue} dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function WeightChart({ rows, series }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#D0D3D4" vertical={false} />
        <XAxis dataKey="Date" tickFormatter={dateTick} minTickGap={28} tick={{ fontSize: 12 }} />
        <YAxis width={56} unit=" gal" domain={[0, 10]} tick={{ fontSize: 12 }} />
        <Tooltip labelFormatter={tipLabel} />
        <Legend />
        {series.map((item, index) => (
          <Line
            key={item.key}
            type="monotone"
            dataKey={item.key}
            name={item.name}
            stroke={TREE_COLORS[index % TREE_COLORS.length]}
            dot={false}
            strokeWidth={2}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DailyFlowChart({ rows }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#D0D3D4" vertical={false} />
        <XAxis dataKey="Date" tickFormatter={dateTick} minTickGap={28} tick={{ fontSize: 12 }} />
        <YAxis width={48} unit=" gal" tick={{ fontSize: 12 }} />
        <Tooltip labelFormatter={tipLabel} />
        <Bar dataKey="Flow_Gal" name="Sap flow (gal)" fill={ritOrange} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DailySugarChart({ rows }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#D0D3D4" vertical={false} />
        <XAxis dataKey="Date" tickFormatter={dateTick} minTickGap={28} tick={{ fontSize: 12 }} />
        <YAxis width={48} unit="%" domain={[0, 4]} tick={{ fontSize: 12 }} />
        <Tooltip labelFormatter={tipLabel} />
        <Line
          type="monotone"
          dataKey="Sugar_Percent"
          name="Sugar %"
          stroke={accent.green}
          connectNulls
          dot={false}
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SiteForecastChart({ rows }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#D0D3D4" vertical={false} />
        <XAxis dataKey="Date" tickFormatter={dateTick} tick={{ fontSize: 12 }} />
        <YAxis yAxisId="temp" width={40} unit="°" tick={{ fontSize: 12 }} />
        <YAxis yAxisId="flow" orientation="right" width={36} tick={{ fontSize: 12 }} />
        <Tooltip labelFormatter={tipLabel} />
        <Legend />
        <Bar yAxisId="flow" dataKey="Flow_Gal" name="Sap gal" fill={ritOrange} radius={[3, 3, 0, 0]} />
        <Line yAxisId="temp" type="monotone" dataKey="Temp_Max_F" name="Afternoon high" stroke="#009CBD" dot={false} strokeWidth={2} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

const TREE_COLORS = ['#F76902', '#009CBD', '#84BD00', '#000000', '#7D55C7', '#DA291C', '#C75300', '#7C878E'];

export function OverlayChart({ rows, flowSeries, tempSeries }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#D0D3D4" vertical={false} />
        <XAxis dataKey="Date" tickFormatter={dateTick} minTickGap={24} tick={{ fontSize: 12 }} />
        <YAxis yAxisId="flow" width={48} unit=" gal" tick={{ fontSize: 12 }} />
        <YAxis yAxisId="temp" orientation="right" width={44} unit="°" tick={{ fontSize: 12 }} />
        <Tooltip labelFormatter={tipLabel} />
        <Legend />
        {flowSeries.map((series) => (
          <Line
            key={series.key}
            yAxisId="flow"
            type="monotone"
            dataKey={series.key}
            name={series.name}
            stroke={series.color}
            dot={false}
            strokeWidth={2}
            connectNulls
          />
        ))}
        {tempSeries.map((series) => (
          <Line
            key={series.key}
            yAxisId="temp"
            type="monotone"
            dataKey={series.key}
            name={series.name}
            stroke={series.color}
            strokeDasharray="5 4"
            dot={false}
            strokeWidth={2}
            connectNulls
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function TreeCompareChart({ rows, series }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#D0D3D4" vertical={false} />
        <XAxis dataKey="Date" tickFormatter={dateTick} minTickGap={28} tick={{ fontSize: 12 }} />
        <YAxis width={48} tick={{ fontSize: 12 }} />
        <Tooltip labelFormatter={tipLabel} />
        <Legend />
        {series.map((name, index) => (
          <Line
            key={name}
            type="monotone"
            dataKey={name}
            name={name}
            stroke={TREE_COLORS[index % TREE_COLORS.length]}
            dot={false}
            strokeWidth={2}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
