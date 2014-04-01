
using System.Diagnostics;
using System.Text;

namespace BudgetAppWeb.Helpers
{
    public static class Log
    {
        public static void Information(string s)
        {
            var sb = new StringBuilder();
            sb.Append("----------------------------------------------------\n\n");
            sb.Append("Message:\n\n");
            sb.Append(s);
            sb.Append("\n\n");
            sb.Append("----------------------------------------------------");
            Trace.TraceInformation(sb.ToString());
        }

        public static void Information(string message, params object[] args)
        {
            var sb = new StringBuilder();
            sb.Append("----------------------------------------------------\n\n");
            sb.Append("Message:\n\n");
            sb.Append(message);
            sb.Append("\n\n");
            for (var i = 0; i < args.Length; i++)
            {
                sb.Append(string.Format("{0})\n", i + 1));
                var a = args[i];
                sb.Append(a);
                sb.Append("\n\n");
            }
            sb.Append("----------------------------------------------------");
            Trace.TraceInformation(sb.ToString());
        }

        public static void Error(string s)
        {
            var sb = new StringBuilder();
            sb.Append("----------------------------------------------------\n\n");
            sb.Append("Error:\n\n");
            sb.Append(s);
            sb.Append("\n\n");
            sb.Append("----------------------------------------------------");
            Trace.TraceError(sb.ToString());
        }

        public static void Error(string error, params object[] args)
        {
            var sb = new StringBuilder();
            sb.Append("----------------------------------------------------\n\n");
            sb.Append("Error:\n\n");
            sb.Append(error);
            sb.Append("\n\n");
            for (var i = 0; i < args.Length; i++)
            {
                sb.Append(string.Format("{0})\n", i + 1));
                var a = args[i];
                sb.Append(a);
                sb.Append("\n\n");
            }
            sb.Append("----------------------------------------------------");
            Trace.TraceError(sb.ToString());
        }
    }
}