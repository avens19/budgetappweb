using System;
using System.Configuration;

namespace BudgetAppWeb.Helpers
{
    public static class Helpers
    {
        public static DateTime ToDateTime(this long l)
        {
            //convert from Javascript time
            var date = new DateTime(1970, 01, 01);
            return date.AddTicks(l * 10000);
        }
    }
}