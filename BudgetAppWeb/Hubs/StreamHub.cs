using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;
using Microsoft.AspNet.SignalR;

namespace BudgetAppWeb.Hubs
{
    public class StreamHub : Hub
    {
        // ReSharper disable once InconsistentNaming
        private static readonly IHubContext _context; 

        static StreamHub ()
        {
            _context = GlobalHost.ConnectionManager.GetHubContext<StreamHub>();
        }

        public static void NewEvent(string message)
        {
            _context.Clients.All.newEvent(message);
        }
    }
}