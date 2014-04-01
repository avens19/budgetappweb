using System;

namespace BudgetAppWeb.Helpers
{
    public static class Helpers
    {
        public const string ApiKey = "__API_KEY__";

        public static DateTime ToDateTime(this long l)
        {
            //convert from Javascript time
            var date = new DateTime(1970, 01, 01);
            return date.AddTicks(l * 10000);
        }
    }
}