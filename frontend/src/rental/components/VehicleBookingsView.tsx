import { Calendar, Clock, User, MapPin, CheckCircle, XCircle, ChevronRight, TrendingUp } from 'lucide-react';

interface VehicleBookingsViewProps {
  isDarkMode: boolean;
  vehicleName?: string;
}

type BookingStatus = 'active' | 'upcoming' | 'completed' | 'cancelled';

interface Booking {
  id: string;
  customer: string;
  status: BookingStatus;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  pickupLocation: string;
  returnLocation: string;
  totalPrice: string;
  days: number;
}

const bookings: Booking[] = [];

const statusConfig = {
  active: { label: 'Active', bgColor: 'bg-green-100/80', textColor: 'text-green-700', borderColor: 'border-green-200/50', icon: CheckCircle, iconColor: 'text-green-600' },
  upcoming: { label: 'Upcoming', bgColor: 'bg-blue-100/80', textColor: 'text-blue-700', borderColor: 'border-blue-200/50', icon: Clock, iconColor: 'text-blue-600' },
  completed: { label: 'Completed', bgColor: 'bg-gray-100/80', textColor: 'text-gray-600', borderColor: 'border-gray-200/50', icon: CheckCircle, iconColor: 'text-gray-500' },
  cancelled: { label: 'Cancelled', bgColor: 'bg-red-100/80', textColor: 'text-red-700', borderColor: 'border-red-200/50', icon: XCircle, iconColor: 'text-red-600' },
};

export function VehicleBookingsView({ isDarkMode }: VehicleBookingsViewProps) {
  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Bookings', value: '0', sub: 'All time', icon: Calendar, iconBg: 'bg-gray-100/80', iconColor: 'text-gray-500' },
          { label: 'Active', value: '0', sub: 'Currently rented', icon: CheckCircle, iconBg: 'bg-green-100/80', iconColor: 'text-green-600' },
          { label: 'Upcoming', value: '0', sub: 'Scheduled', icon: Clock, iconBg: 'bg-blue-100/80', iconColor: 'text-blue-600' },
          { label: 'Revenue', value: '€0', sub: 'This vehicle', icon: TrendingUp, iconBg: 'bg-purple-100/80', iconColor: 'text-purple-600' },
        ].map((stat) => {
          const StatIcon = stat.icon;
          return (
            <div
              key={stat.label}
              className={`rounded-3xl p-4 shadow-sm hover:shadow-md transition-all duration-300 ${
                isDarkMode
                  ? 'bg-neutral-900'
                  : 'bg-white'
              }`}
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${stat.iconBg}`}>
                  <StatIcon className={`w-5 h-5 ${stat.iconColor}`} />
                </div>
                <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{stat.label}</span>
              </div>
              <p className={`text-xs font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{stat.value}</p>
              <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{stat.sub}</span>
            </div>
          );
        })}
      </div>

      {/* Booking List */}
      <div className={`rounded-3xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden ${
        isDarkMode ? 'bg-neutral-900' : 'bg-white'
      }`}>
        <div className={`px-3 py-3 border-b ${isDarkMode ? 'border-neutral-700' : 'border-gray-200'}`}>
          <h3 className={`text-base ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Booking History</h3>
        </div>
        <div className={`divide-y ${isDarkMode ? 'divide-neutral-800/50' : 'divide-gray-100/80'}`}>
          {bookings.length === 0 ? (
            <div className="px-3 py-12 text-center">
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>No bookings for this vehicle</p>
            </div>
          ) : (
            bookings.map((booking) => {
              const config = statusConfig[booking.status];
              const StatusIcon = config.icon;
              return (
                <div
                  key={booking.id}
                  className={`px-3 py-3 flex items-center gap-3 transition-colors cursor-pointer group ${
                    isDarkMode ? 'hover:bg-neutral-800/50' : 'hover:bg-gray-50/50'
                  }`}
                >
                  {/* Status Icon */}
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${config.bgColor} border ${config.borderColor}`}>
                    <StatusIcon className={`w-5 h-5 ${config.iconColor}`} />
                  </div>

                  {/* Booking Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span className={`text-xs ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{booking.id}</span>
                      <span className={`px-2 py-0.5 rounded-lg text-xs border ${config.bgColor} ${config.textColor} ${config.borderColor}`}>{config.label}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className={`text-xs flex items-center gap-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        <User className="w-3 h-3" /> {booking.customer}
                      </span>
                      <span className={`text-xs flex items-center gap-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        <MapPin className="w-3 h-3" /> {booking.pickupLocation}
                      </span>
                    </div>
                  </div>

                  {/* Date */}
                  <div className="text-right">
                    <span className={`text-xs ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                      {booking.startDate} – {booking.endDate}
                    </span>
                    <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      {booking.days} {booking.days === 1 ? 'day' : 'days'}
                    </p>
                  </div>

                  {/* Price */}
                  <div className="text-right w-20">
                    <span className={`text-xs ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{booking.totalPrice}</span>
                  </div>

                  <ChevronRight className={`w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
