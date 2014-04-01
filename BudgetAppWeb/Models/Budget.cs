using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Data.Entity;
using BudgetAppWeb.Migrations;

namespace BudgetAppWeb.Models
{
    public class Budget
    {
        private DateTime _dateCreated;
        private DateTime _dateUpdated;

        /// <summary>
        /// A client generated globally unique ID
        /// </summary>
        [Key]
        public string UniqueId { get; set; }
        /// <summary>
        /// The name of the budget
        /// </summary>
        public string Name { get; set; }
        /// <summary>
        /// The day of the week for which each budget starts
        /// </summary>
        public int StartDay { get; set; }
        /// <summary>
        /// The amount of each week's budget in currency
        /// </summary>
        public double Amount { get; set; }
        /// <summary>
        /// The database generated date for which this budget was created
        /// </summary>
        [Index]
        public DateTime DateCreated { get { return _dateCreated; } set { _dateCreated = new DateTime(value.Ticks, DateTimeKind.Utc); } }
        /// <summary>
        /// The database generated date for which this expense was last updated
        /// </summary>
        [Index]
        public DateTime DateUpdated { get { return _dateUpdated; } set { _dateUpdated = new DateTime(value.Ticks, DateTimeKind.Utc); } }

        [NotMapped]
        public string StartDayOfWeek 
        {
            get
            {
                switch (StartDay)
                { 
                    case 0:
                        return "Sunday";
                    case 1:
                        return "Monday";
                    case 2:
                        return "Tuesday";
                    case 3:
                        return "Wednesday";
                    case 4:
                        return "Thursday";
                    case 5:
                        return "Friday";
                    case 6:
                        return "Saturday";
                    default:
                        return "Sunday";
                }
            }
            set
            {
                switch (value)
                {
                    case "Friday":
                        StartDay = 5;
                        break;
                    case "Monday":
                        StartDay = 1;
                        break;
                    case "Saturday":
                        StartDay = 6;
                        return;
                    case "Sunday":
                        StartDay = 0;
                        break;
                    case "Thursday":
                        StartDay = 4;
                        break;
                    case "Tuesday":
                        StartDay = 2;
                        break;
                    case "Wednesday":
                        StartDay = 3;
                        break;
                    default:
                        break;
                }
            }
        }

        public Budget()
        {
            UniqueId = Guid.NewGuid().ToString();
            StartDay = 0;
            Amount = 0;
        }

        public override string ToString()
        {
            return string.Format("ID: {0,50}\nAmount: {1,46}\nStart Day: {2,43}", UniqueId, Amount.ToString("C"), StartDayOfWeek);
        }
    }

    public class BudgetDbContext:DbContext
    {
        public BudgetDbContext()
        {
            Database.CommandTimeout = 60;
        }

        public DbSet<Budget> Budgets { get; set; }
        public DbSet<Expense> Expenses { get; set; }
        public DbSet<Category> Categories { get; set; }
    }
}